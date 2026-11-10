import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import {
  LoyaltyVoucherRedemption,
  type VoucherRestitution,
  type VoucherSettlement,
} from "../../../orders/domain/ports/loyalty-voucher-redemption.js";
import { VoucherOrderReader } from "../../../orders/domain/ports/voucher-order.reader.js";
import type {
  LoyaltyVoucher,
  VoucherReinstatement,
} from "../../domain/entities/loyalty-voucher.js";
import { LoyaltyVoucherNotFoundError } from "../../domain/errors/loyalty-errors.js";
import {
  LoyaltyVoucherExpiredEvent,
  LoyaltyVoucherReinstatedEvent,
  LoyaltyVoucherRemainderIssuedEvent,
  LoyaltyVoucherRemainderLapsedEvent,
  type NamedHolder,
} from "../../domain/events/loyalty.events.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import { LoyaltyHolderLock } from "../../domain/ports/loyalty-holder.lock.js";
import { LoyaltyVoucherRepository } from "../../domain/ports/loyalty-voucher.repository.js";
import { loadOwnedVoucher } from "./owned-voucher.js";
import { restitutionOf } from "./voucher-restitution-outcome.js";

/** Les règlements qui laissent une commande en suspens : jamais soldée. */
const UNSETTLED = new Set(["pending", "failed"]);

/**
 * La fidélité engage, rend et solde ses bons pour la commande (plan des
 * points, C3, C4, C5). Implémente le port d'écriture que la commande déclare ;
 * relié dans `appBootstrap/loyalty-voucher.module.ts`.
 *
 * Chaque geste suit le même cycle : ouvrir (ou rejoindre) l'unité de travail,
 * prendre le **verrou du titulaire**, RELIRE le bon sous ce verrou, le muter
 * par sa méthode, le sauver. Deux passations sur le même bon se suivent : la
 * seconde relit un bon déjà réservé, et l'agrégat la refuse.
 *
 * `settleRemainder` est la délégation que le rattrapage de nuit invoque ; elle
 * trace ses faits sous l'unité de travail (`lint:journal-tracked`).
 *
 * `reinstate` (lot C3b) rend le bon d'une commande annulée par l'équipe, en
 * refondant son reliquat s'il en a laissé un. Ordre des verrous : la commande
 * a pris sa ligne `orders` puis la journée du fournil ; on prend ici le
 * titulaire. Personne ne prend un verrou de commande APRÈS le titulaire — les
 * relectures de commande faites ici ne verrouillent rien.
 */
@Injectable()
export class LoyaltyVoucherRedeeming extends LoyaltyVoucherRedemption {
  constructor(
    private readonly vouchers: LoyaltyVoucherRepository,
    private readonly lock: LoyaltyHolderLock,
    private readonly holders: LoyaltyHolderDirectory,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly orders: VoucherOrderReader,
  ) {
    super();
  }

  async reserve(voucherId: string, holderUserId: string, now: Date): Promise<void> {
    await this.uow.run(async () => {
      const found = await loadOwnedVoucher(this.vouchers, voucherId, holderUserId);
      await this.lock.acquire(found.holder);
      const voucher = await loadOwnedVoucher(this.vouchers, voucherId, holderUserId);
      voucher.reserve(now);
      await this.vouchers.save(voucher);
    });
  }

  async release(voucherId: string, now: Date): Promise<void> {
    await this.uow.run(async () => {
      const voucher = await this.loadLocked(voucherId);
      if (voucher.release(now) === "expired") {
        // Libéré après sa date limite : il passe directement à `expired`
        // (D7), et le journal le dit comme la nuit l'aurait dit.
        const named = await this.named(voucher);
        await this.events.publishTraced(new LoyaltyVoucherExpiredEvent(named, voucher));
      }
      await this.vouchers.save(voucher);
    });
  }

  async settleRemainder(settlement: VoucherSettlement, now: Date): Promise<void> {
    await this.uow.run(async () => {
      // Relu SOUS le verrou : un second passage trouve la marque posée par le
      // premier, et l'agrégat rend `settled` sans rien refaire.
      const parent = await this.loadLocked(settlement.voucherId);
      if (!(await this.stillCarriedBy(settlement))) {
        return;
      }
      const outcome = parent.leaveRemainder({
        id: this.ids.next(),
        appliedCents: settlement.appliedCents,
        at: now,
      });
      if (outcome.kind === "settled") {
        return;
      }
      // La marque part dans tous les cas — émis, éteint, ou rien à émettre.
      await this.vouchers.save(parent);
      if (outcome.kind === "none") {
        return;
      }
      const named = await this.named(parent);
      if (outcome.kind === "lapsed") {
        await this.events.publishTraced(
          new LoyaltyVoucherRemainderLapsedEvent(
            named,
            parent,
            settlement.order,
            outcome.remainderCents,
          ),
        );
        return;
      }
      await this.vouchers.save(outcome.voucher);
      await this.events.publishTraced(
        new LoyaltyVoucherRemainderIssuedEvent(named, outcome.voucher, parent, settlement.order),
      );
    });
  }

  async reinstate(
    voucherId: string,
    order: { readonly id: string; readonly number: string },
    now: Date,
  ): Promise<VoucherRestitution> {
    return this.uow.run(async () => {
      const parent = await this.loadLocked(voucherId);
      const remainder = await this.vouchers.loadLiveRemainderOf(parent.id);
      // La commande annulée vient d'être écrite `cancelled` dans cette
      // transaction : elle n'est plus vivante. Une AUTRE qui porte le bon
      // veut dire qu'il a déjà été rendu, puis réengagé (C3b.3).
      const carrier = (await this.orders.liveOrdersCarrying([parent.id])).get(parent.id);
      const outcome = parent.reinstate({
        remainder,
        at: now,
        orderId: order.id,
        engagedElsewhere: carrier !== undefined && carrier.orderId !== order.id,
      });
      await this.persistReinstatement(parent, outcome, order);
      return restitutionOf(outcome, parent, this.orders);
    });
  }

  /** Les écritures et les traces de chaque issue ; `already` et `blocked` n'en ont aucune. */
  private async persistReinstatement(
    parent: LoyaltyVoucher,
    outcome: VoucherReinstatement,
    order: { readonly id: string; readonly number: string },
  ): Promise<void> {
    if (outcome.kind === "already" || outcome.kind === "blocked") {
      return;
    }
    const named = await this.named(parent);
    await this.vouchers.save(parent);
    if (outcome.kind === "lapsed") {
      await this.events.publishTraced(new LoyaltyVoucherExpiredEvent(named, parent));
      if (outcome.remainderExpired && outcome.remainder !== null) {
        await this.vouchers.save(outcome.remainder);
        await this.events.publishTraced(new LoyaltyVoucherExpiredEvent(named, outcome.remainder));
      }
      return;
    }
    const merged = outcome.kind === "merged" ? outcome.remainder : null;
    if (merged !== null) {
      await this.vouchers.save(merged);
    }
    await this.events.publishTraced(
      new LoyaltyVoucherReinstatedEvent(named, parent, merged, order),
    );
  }

  /**
   * La commande du lot porte-t-elle ENCORE le bon, sans règlement en suspens ?
   * Relue sous le verrou du titulaire, SANS `FOR UPDATE` (C3b.1, 4 ; C3b.5) :
   * un verrou de commande pris ici renverserait l'ordre commande → titulaire.
   * Annulée entre la lecture du lot et ce verrou, puis le bon réengagé
   * ailleurs, le reliquat serait calculé sur la mauvaise commande.
   */
  private async stillCarriedBy(settlement: VoucherSettlement): Promise<boolean> {
    const carriers = await this.orders.liveOrdersCarrying([settlement.voucherId]);
    const carrier = carriers.get(settlement.voucherId);
    return (
      carrier !== undefined &&
      carrier.orderId === settlement.order.id &&
      !UNSETTLED.has(carrier.paymentStatus)
    );
  }

  /** Le bon relu SOUS le verrou de son titulaire — l'état qu'on mute est celui d'après l'attente. */
  private async loadLocked(voucherId: string): Promise<LoyaltyVoucher> {
    const found = await this.vouchers.load(voucherId);
    if (found === null) {
      throw new LoyaltyVoucherNotFoundError(voucherId);
    }
    await this.lock.acquire(found.holder);
    const voucher = await this.vouchers.load(voucherId);
    if (voucher === null) {
      throw new LoyaltyVoucherNotFoundError(voucherId);
    }
    return voucher;
  }

  /** Sans nom lisible, le fait n'en porte pas : omis plutôt qu'inventé. */
  private async named(voucher: LoyaltyVoucher): Promise<NamedHolder> {
    const label = (await this.holders.describe(voucher.holder))?.label ?? null;
    return { holder: voucher.holder, label };
  }
}

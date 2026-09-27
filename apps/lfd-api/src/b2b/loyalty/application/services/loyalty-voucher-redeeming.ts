import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import {
  LoyaltyVoucherRedemption,
  type VoucherSettlement,
} from "../../../orders/domain/ports/loyalty-voucher-redemption.js";
import type { LoyaltyVoucher } from "../../domain/entities/loyalty-voucher.js";
import { LoyaltyVoucherNotFoundError } from "../../domain/errors/loyalty-errors.js";
import {
  LoyaltyVoucherExpiredEvent,
  LoyaltyVoucherRemainderIssuedEvent,
  LoyaltyVoucherRemainderLapsedEvent,
  type NamedHolder,
} from "../../domain/events/loyalty.events.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import { LoyaltyHolderLock } from "../../domain/ports/loyalty-holder.lock.js";
import { LoyaltyVoucherRepository } from "../../domain/ports/loyalty-voucher.repository.js";
import { loadOwnedVoucher } from "./owned-voucher.js";

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

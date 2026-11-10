import { Injectable, Logger } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { OrderBilling } from "../../../orders/domain/entities/order-billing.js";
import { AccountOrderEngagementReader } from "../../../orders/domain/ports/account-order-engagement.js";
import { AccountOrderSettlement } from "../../../orders/domain/ports/account-order-settlement.js";
import { OrderBillingRepository } from "../../../orders/domain/ports/order-billing.repository.js";
import type { DeliveryNote } from "../../domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";
import { handedOverAmountsOf } from "../../domain/services/handed-over-amounts.js";

/** Un écart du solde : des montants facturables qui ne sont pas ceux de la règle. */
export interface BillingGap {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly fields: readonly string[];
  /**
   * Déjà ENGAGÉE — facturée, relevée ou prélevée (plan E6c2, § 4) : rien n'a
   * été corrigé, le gel l'interdit ; un écart s'y reprend par un avoir.
   */
  readonly engaged: boolean;
}

/** Le compte du solde d'un passage du réconciliateur. */
export interface BillingTally {
  closed: number;
  corrected: number;
  compared: number;
  readonly gaps: BillingGap[];
}

/** Ce que le tri sans verrou a vu d'une commande. */
type Verdict = "close" | "correct" | "frozen" | "fine" | "unsettled";

/**
 * **Le solde de la commande, écrit par les bons de livraison** (lot E6c1,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 12.3 et
 * § 13) : les deux seuls écrivains d'`OrderBilling` — le suivi à la remise
 * ({@link closeLocked}, la commande déjà verrouillée par la remise), et le
 * réconciliateur pour l'existant ({@link reconcile}, chaque écriture dans sa
 * propre transaction sous le verrou de la commande). L'exclusion entre les
 * deux tient au `WHERE billable_total_cents IS NULL` de la pose.
 *
 * Depuis E6c2, la facture, le relevé et le prélèvement les LISENT : au solde,
 * la ligne d'encaissement encore ouverte (`due`, `excluded`) suit le montant facturable
 * (`AccountOrderSettlement`, même unité de travail), et une commande ENGAGÉE
 * n'est plus corrigée — le déclencheur `orders_billable_frozen` le refuserait.
 */
@Injectable()
export class OrderBillingCloser {
  private readonly logger = new Logger(OrderBillingCloser.name);

  constructor(
    private readonly billings: OrderBillingRepository,
    private readonly notes: DeliveryNoteRepository,
    private readonly engagements: AccountOrderEngagementReader,
    private readonly settlement: AccountOrderSettlement,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /** À la remise, dans l'unité de travail du geste : pose le solde s'il est atteint. */
  async closeLocked(orderId: string): Promise<void> {
    const billing = await this.billings.lock(orderId);
    if (billing === null) {
      return;
    }
    const notes = await this.notes.loadForOrders([orderId]);
    if (billing.closeBilling(handedOverAmountsOf(orderId, notes))) {
      await this.persist(billing);
    }
  }

  /**
   * Le passage du réconciliateur sur une page : trie sans verrou, puis pose
   * ou corrige sous verrou ; compte ce qui est juste, nomme ce qui ne l'est
   * pas. `budget` borne les écritures ; rend celles qu'il a faites.
   */
  async reconcile(
    orderIds: readonly string[],
    notes: readonly DeliveryNote[],
    tally: BillingTally,
    budget: number,
  ): Promise<number> {
    let writes = 0;
    for (const billing of await this.billings.load(orderIds)) {
      const verdict = await this.verdictOf(billing, notes, tally);
      if ((verdict === "close" || verdict === "correct") && writes < budget) {
        writes += 1;
        await this.repair(billing.orderId, verdict, tally);
      }
    }
    return writes;
  }

  private async verdictOf(
    billing: OrderBilling,
    notes: readonly DeliveryNote[],
    tally: BillingTally,
  ): Promise<Verdict> {
    const handed = handedOverAmountsOf(billing.orderId, notes);
    if (billing.toSnapshot().billable === null) {
      if (billing.closeBilling(handed)) {
        return "close";
      }
      const gap = billing.settlementGapOf(handed);
      if (gap !== null) {
        tally.gaps.push({
          orderId: billing.orderId,
          orderNumber: billing.reference,
          fields: [gap],
          engaged: false,
        });
      }
      return "unsettled";
    }
    tally.compared += 1;
    const fields = billing.gapsOf(handed);
    if (fields.length === 0) {
      return "fine";
    }
    const engaged = await this.engaged(billing.orderId);
    if (!engaged && fields[0] !== "settlement") {
      return "correct";
    }
    tally.gaps.push({ orderId: billing.orderId, orderNumber: billing.reference, fields, engaged });
    return "frozen";
  }

  private async repair(
    orderId: string,
    verdict: "close" | "correct",
    tally: BillingTally,
  ): Promise<void> {
    try {
      const written = await this.uow.run(async () => {
        const billing = await this.billings.lock(orderId);
        if (billing === null) {
          return false;
        }
        const handed = handedOverAmountsOf(orderId, await this.notes.loadForOrders([orderId]));
        const changed =
          verdict === "close"
            ? billing.closeBilling(handed)
            : billing.correctBilling(handed, await this.engaged(orderId));
        return changed && (await this.persist(billing));
      });
      if (written) {
        tally[verdict === "close" ? "closed" : "corrected"] += 1;
      }
    } catch (error) {
      this.logger.error(`Solde non posé (commande ${orderId})`, error);
    }
  }

  /** Pose le solde, puis recale l'encaissement `due` dessus — dans l'unité de travail de l'appelant. */
  private async persist(billing: OrderBilling): Promise<boolean> {
    if (!(await this.billings.save(billing))) {
      return false;
    }
    const { billable } = billing.toSnapshot();
    if (billable !== null) {
      await this.settlement.alignOnSettlement(
        billing.orderId,
        billable.totalCents,
        this.clock.now(),
      );
    }
    return true;
  }

  /**
   * Engagée : tout ce qui n'est pas `free` — facture, lot, prélèvement, rejet
   * re-présenté, réglée autrement (plan E6c2, § 4 BLOQUANT 1). Un engagement
   * qu'on ne sait pas établir se traite comme engagé : on ne corrige pas à
   * l'aveugle.
   */
  private async engaged(orderId: string): Promise<boolean> {
    const engagement = await this.engagements.engagementOf(orderId);
    return engagement === null || engagement.kind !== "free";
  }
}

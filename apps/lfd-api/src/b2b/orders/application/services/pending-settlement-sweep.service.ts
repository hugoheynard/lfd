import { Injectable, Logger } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  PendingSettlementSweeper,
  type ServiceDay,
} from "../../../../production/channels/commerce/index.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import { OrderPaymentFailedEvent } from "../../domain/events/order-payment-failed.event.js";
import { LoyaltyVoucherRedemption } from "../../domain/ports/loyalty-voucher-redemption.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import {
  UnsettledSettlementReader,
  type UnsettledSettlement,
} from "../../domain/ports/unsettled-settlement.reader.js";
import { settlementSweepWindow } from "../../domain/services/settlement-sweep.js";

/**
 * **La clôture tue les règlements en vol de sa journée** (plan
 * `documentation/order/plan-abandon-du-reglement.md`, D3, Q1, Q7, B1, B2).
 *
 * Le commerce implémente ici le port que le fournil déclare : pour chaque
 * commande `placed` dont le règlement n'est pas encaissé — en attente ou
 * refusé —, on TENTE d'annuler l'intention chez Stripe, puis on écrit
 * `cancelled` + `failed` **quelle que soit l'issue**. Toutes les clientèles
 * (Q7) : un pro non réglé à la clôture est annulé, et la cloche le dit.
 *
 * ## Pourquoi on écrit même quand Stripe n'a rien confirmé
 *
 * Le fournil ne s'arrête pas pour une panne Stripe (B1). Une intention restée
 * vivante peut encore être payée : ce cas est tenu par l'encaissement, qui ne
 * rouvre jamais une commande annulée et sonne « à rembourser » (lot 6 bis).
 * L'issue non confirmée part au journal applicatif.
 *
 * ⚠️ **Une authentification 3-D Secure en cours est tuée**, et c'est assumé
 * (§9 bis, S7) : à l'heure de la clôture, elle paierait une commande qui ne
 * sera pas produite.
 *
 * ## Idempotent
 *
 * `failAtClosing` est conditionné en base (`status: placed`, règlement non
 * encaissé) : un second passage ne trouve plus ces commandes, n'écrit rien et
 * ne republie rien. Le fait `day_closed` est publié ICI, sur le seul
 * franchissement — `FAILED_FROM` ne franchirait pas une commande déjà refusée.
 *
 * ## Le bon de fidélité revient avec l'annulation
 *
 * `failAtClosing` est la seconde des deux écritures de `cancelled` (plan des
 * points, C4). Quand elle franchit, le bon engagé est libéré dans la même
 * transaction — une par commande : ce balayage tourne HORS de l'unité de
 * travail de la clôture (`close-production-day.handler.ts`, §11 bis S9).
 */
@Injectable()
export class PendingSettlementSweep extends PendingSettlementSweeper {
  private readonly logger = new Logger(PendingSettlementSweep.name);

  constructor(
    private readonly unsettled: UnsettledSettlementReader,
    private readonly payments: PaymentGateway,
    private readonly orders: OrderRepository,
    private readonly events: DomainEventPublisher,
    private readonly unitOfWork: UnitOfWork,
    private readonly vouchers: LoyaltyVoucherRedemption,
    private readonly clock: Clock,
  ) {
    super();
  }

  async sweep(day: ServiceDay): Promise<void> {
    const found = await this.unsettled.unsettledOn(settlementSweepWindow(day.value));
    for (const settlement of found) {
      await this.cut(settlement);
    }
  }

  private async cut(settlement: UnsettledSettlement): Promise<void> {
    if (settlement.paymentIntentId !== null) {
      const spared = await this.tryCancel(settlement.orderId, settlement.paymentIntentId);
      if (spared) {
        return;
      }
    }
    if (await this.failAtClosing(settlement)) {
      this.events.publish(new OrderPaymentFailedEvent(settlement.orderId, "day_closed"));
    }
  }

  /** L'annulation, et la libération du bon si elle a franchi — ensemble ou pas du tout. */
  private async failAtClosing(settlement: UnsettledSettlement): Promise<boolean> {
    return this.unitOfWork.run(async () => {
      const crossed = await this.orders.failAtClosing(settlement.orderId);
      if (crossed && settlement.loyaltyVoucherId !== null) {
        await this.vouchers.release(settlement.loyaltyVoucherId, this.clock.now());
      }
      return crossed;
    });
  }

  /**
   * Tente la mise à mort chez Stripe, et dit si la commande doit être
   * **épargnée**. `cancelIntent` ne lève jamais.
   *
   * 🔴 **De l'argent pris, ou en train de l'être, épargne la commande**
   * (`already_paid`, `in_progress`) : le client a payé avant la clôture, et
   * seul le webhook est en retard. L'annuler ferait rembourser une vente réelle
   * et lui écrirait « rien n'a été débité » — c'est ce que le §5 du plan
   * d'abandon disait déjà pour le clic du client (corrigé le 2026-09-26, avant
   * tout déploiement). Le webhook la soldera ; elle arrive alors hors du plan
   * arrêté, et c'est l'équipe qui décide.
   *
   * Une panne (`unavailable`) n'épargne rien : la clôture ne dépend pas de
   * Stripe (B1), et un encaissement tardif sonnera « à rembourser » (lot 6 bis).
   */
  private async tryCancel(orderId: string, paymentIntentId: string): Promise<boolean> {
    const outcome = await this.payments.cancelIntent(paymentIntentId);
    if (outcome.kind === "cancelled" || outcome.kind === "already_cancelled") {
      return false;
    }
    if (outcome.kind === "already_paid" || outcome.kind === "in_progress") {
      this.logger.warn(
        `Clôture : commande ${orderId} épargnée, son paiement est ${outcome.kind} chez Stripe ; ` +
          "le webhook la soldera, hors du plan arrêté.",
      );
      return true;
    }
    this.logger.warn(
      `Clôture : intention non annulée chez Stripe (commande ${orderId}) : unavailable ` +
        `(${outcome.reason}). La commande est annulée quand même ; un encaissement tardif ` +
        "sonnera « à rembourser ».",
    );
    return false;
  }
}

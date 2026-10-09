import { Injectable, Logger } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import { OrderPaymentFailedEvent } from "../../domain/events/order-payment-failed.event.js";
import { LoyaltyVoucherRedemption } from "../../domain/ports/loyalty-voucher-redemption.js";
import { UnsettledShopOrderCanceller } from "../../domain/ports/unsettled-shop-order.canceller.js";
import { UnsettledShopOrderReader } from "../../domain/ports/unsettled-shop-order.reader.js";
import type { UnsettledSettlement } from "../../domain/ports/unsettled-settlement.reader.js";
import { unsettledShopOrderCutoff } from "../../domain/services/unsettled-shop-order-expiry.js";

/** Pourquoi une commande boutique non réglée est annulée — et le fait qu'elle publie. */
type ExpiryCause = "expired" | "replaced";

/** Ce qu'un passage a fait : le cron le rend tel quel, pour les logs du Worker. */
export interface UnsettledShopOrderExpiryReport {
  readonly cancelled: number;
  readonly kept: number;
}

/**
 * **Une commande boutique non réglée n'est pas une commande** (plan
 * `documentation/order/plan-commandes-non-reglees.md`, §4.1, §4.2, §4.4).
 *
 * Deux déclencheurs, un seul chemin : l'âge (`expireLapsed`, au cron) et la
 * nouvelle passation du même particulier (`replaceEarlier`). Pour chaque
 * commande du périmètre, on annule l'intention chez Stripe d'abord, et on
 * n'écrit `cancelled` + `failed` que si Stripe confirme qu'elle est morte —
 * l'ordre d'« Abandonner » (`abandon-order.handler.ts`, vérifié le 2026-10-09).
 *
 * ## Ce qui garde la commande
 *
 * - `already_paid` / `in_progress` : de l'argent est pris ou en train de
 *   l'être. La commande est **gardée**, le webhook la soldera, et c'est
 *   journalisé (§4.4) ;
 * - `unavailable` : Stripe injoignable. Rien n'est écrit — contrairement à la
 *   clôture (`pending-settlement-sweep.service.ts`), rien ne presse : le
 *   passage suivant réessaie dans cinq minutes, et une intention vivante ne
 *   laisse jamais une annulée encaissée.
 *
 * Si un paiement arrive malgré tout sur une commande annulée (Stripe a annulé,
 * puis un débit se présente), l'encaissement ne la rouvre pas et sonne « à
 * rembourser » (`confirm-order-payment.handler.ts`, vérifié le 2026-10-09).
 *
 * ## Aucun courriel
 *
 * Les causes `expired` et `replaced` ne sont lues par aucun envoi
 * (`SendPaymentExpiredMail` ne répond qu'à `day_closed`,
 * `SendPaymentFailedMail` qu'à `refused`, vérifié le 2026-10-09) : la personne a
 * quitté la page ou relancé elle-même (§4.2).
 *
 * ## Le bon de fidélité revient avec l'annulation
 *
 * Comme à l'abandon et à la clôture, le bon engagé est libéré dans la même
 * transaction que l'écriture, et seulement si elle a franchi.
 */
@Injectable()
export class UnsettledShopOrderExpiry {
  private readonly logger = new Logger(UnsettledShopOrderExpiry.name);

  constructor(
    private readonly unsettled: UnsettledShopOrderReader,
    private readonly canceller: UnsettledShopOrderCanceller,
    private readonly payments: PaymentGateway,
    private readonly events: DomainEventPublisher,
    private readonly unitOfWork: UnitOfWork,
    private readonly vouchers: LoyaltyVoucherRedemption,
    private readonly clock: Clock,
  ) {}

  /** Annule les commandes du périmètre passées depuis plus que le délai. */
  async expireLapsed(): Promise<UnsettledShopOrderExpiryReport> {
    const found = await this.unsettled.placedBefore(unsettledShopOrderCutoff(this.clock.now()));
    return this.cutAll(found, "expired");
  }

  /** Annule les commandes du périmètre que la commande `newOrderId` remplace. */
  async replaceEarlier(newOrderId: string): Promise<UnsettledShopOrderExpiryReport> {
    const found = await this.unsettled.replacedBy(newOrderId);
    return this.cutAll(found, "replaced");
  }

  private async cutAll(
    found: readonly UnsettledSettlement[],
    cause: ExpiryCause,
  ): Promise<UnsettledShopOrderExpiryReport> {
    let cancelled = 0;
    for (const settlement of found) {
      if (await this.cut(settlement, cause)) {
        cancelled += 1;
      }
    }
    return { cancelled, kept: found.length - cancelled };
  }

  private async cut(settlement: UnsettledSettlement, cause: ExpiryCause): Promise<boolean> {
    if (settlement.paymentIntentId !== null) {
      const dead = await this.intentIsDead(settlement.orderId, settlement.paymentIntentId, cause);
      if (!dead) {
        return false;
      }
    }
    const crossed = await this.unitOfWork.run(async () => {
      const written = await this.canceller.cancel(settlement.orderId);
      if (written && settlement.loyaltyVoucherId !== null) {
        await this.vouchers.release(settlement.loyaltyVoucherId, this.clock.now());
      }
      return written;
    });
    if (crossed) {
      this.events.publish(new OrderPaymentFailedEvent(settlement.orderId, cause));
    }
    return crossed;
  }

  /** Annule l'intention, et dit si elle est morte. `cancelIntent` ne lève jamais. */
  private async intentIsDead(
    orderId: string,
    paymentIntentId: string,
    cause: ExpiryCause,
  ): Promise<boolean> {
    const outcome = await this.payments.cancelIntent(paymentIntentId);
    if (outcome.kind === "cancelled" || outcome.kind === "already_cancelled") {
      return true;
    }
    const detail =
      outcome.kind === "unavailable" ? `unavailable (${outcome.reason})` : outcome.kind;
    this.logger.warn(
      `Commande boutique ${orderId} gardée (${cause}) : son intention est ${detail} chez Stripe ; ` +
        "le webhook la soldera, ou le passage suivant réessaiera.",
    );
    return false;
  }
}

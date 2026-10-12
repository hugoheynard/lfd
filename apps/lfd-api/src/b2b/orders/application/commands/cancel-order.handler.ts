import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderWithdrawalDesk, ServiceDay } from "../../../../production/channels/commerce/index.js";
import {
  PaymentGateway,
  type IntentCancellation,
} from "../../../payments/domain/payment-gateway.js";
import {
  OrderCancellationNotRecordedError,
  OrderCancellationPaymentInProgressError,
  OrderCancellationProviderUnavailableError,
  OrderNotCancellableError,
} from "../../domain/errors/order-cancellation-errors.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderCancelledEvent } from "../../domain/events/order-cancelled.event.js";
import {
  CancellationSubjectReader,
  type CancellationSubject,
} from "../../domain/ports/cancellation-subject.reader.js";
import { LoyaltyVoucherRedemption } from "../../domain/ports/loyalty-voucher-redemption.js";
import { OrderCancellationRepository } from "../../domain/ports/order-cancellation.repository.js";
import {
  cancellationOf,
  cancellationStateOf,
  type CancellableRegime,
} from "../../domain/services/order-cancellation.js";
import { CancellationReason } from "../../domain/value-objects/cancellation-reason.js";
import { CancelOrderCommand } from "./cancel-order.command.js";

/**
 * **L'annulation d'une commande par l'équipe** (plan
 * `documentation/order/plan-annulation-de-commande.md`, lot C3 : C3.3 à C3.7).
 *
 * ## L'ordre des gestes (C3.4 bis)
 *
 * 1. Lire la commande et appliquer la règle (`cancellationOf`) : refus
 *    immédiats, aucun appel.
 * 2. Carte non payée avec une intention : la FERMER chez Stripe, hors
 *    transaction — l'ordre de `AbandonOrderHandler`, sans sa condition
 *    « particulier seulement » : une annulation ferme l'intention de toutes
 *    les clientèles (décision 7). Pas d'appel réseau sous un verrou, et jamais
 *    une annulée encore payable.
 * 3. La transaction (C3.4 ter) : ligne `orders` verrouillée et relue, retrait
 *    au fournil sous le verrou de la journée, écriture conditionnée, bon rendu
 *    et fait durable si — et seulement si — l'écriture a franchi.
 *
 * ## La transaction qui échoue après Stripe (C3.4 ter)
 *
 * Rejouée UNE fois dans la requête ; la relecture sous `FOR UPDATE` rend le
 * rejeu sûr. Deux échecs : {@link OrderCancellationNotRecordedError} (500), qui
 * dit au staff de relancer — Stripe répondra alors `already_cancelled`. Un
 * REFUS (règle, inscription au fournil) ne se rejoue pas : il dirait la même
 * chose.
 *
 * ## Ce qu'il ne fait pas
 *
 * Aucun mur client (la route est staff), aucun remboursement (C4), aucune
 * commande au compte (C3.9).
 */
@CommandHandler(CancelOrderCommand)
export class CancelOrderHandler implements ICommandHandler<CancelOrderCommand, void> {
  private readonly logger = new Logger(CancelOrderHandler.name);

  constructor(
    private readonly subjects: CancellationSubjectReader,
    private readonly cancellations: OrderCancellationRepository,
    private readonly payments: PaymentGateway,
    private readonly desk: OrderWithdrawalDesk,
    private readonly vouchers: LoyaltyVoucherRedemption,
    private readonly durable: DurablePublisher,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: CancelOrderCommand): Promise<void> {
    const reason = CancellationReason.of(command.reason);
    const subject = await this.subjects.find(command.orderId);
    if (subject === null) {
      throw new OrderNotFoundError(command.orderId);
    }
    const regime = this.ensureCancellable(subject);
    const intentClosed = await this.closeIntent(subject, regime);
    await this.recordOnce(command, reason, intentClosed);
  }

  /** La règle, sans verrou : un refus ici n'a rien touché. */
  private ensureCancellable(subject: CancellationSubject): CancellableRegime {
    const decision = cancellationOf(cancellationStateOf(subject, null));
    if (!decision.cancellable) {
      throw new OrderNotCancellableError(subject.orderId, decision.block);
    }
    return decision.regime;
  }

  /**
   * Ferme l'intention d'une carte non payée. Rend `true` si Stripe a été
   * appelé et confirme qu'elle est morte ; `false` sans appel (total nul, ou
   * carte sans intention : la transaction écrit directement).
   */
  private async closeIntent(
    subject: CancellationSubject,
    regime: CancellableRegime,
  ): Promise<boolean> {
    if (regime !== "due" || subject.stripePaymentIntentId === null) {
      return false;
    }
    const outcome = await this.payments.cancelIntent(subject.stripePaymentIntentId);
    this.ensureIntentDead(outcome, subject);
    return true;
  }

  /** Les cinq issues de `cancelIntent` : deux laissent écrire, trois refusent sans rien toucher. */
  private ensureIntentDead(outcome: IntentCancellation, subject: CancellationSubject): void {
    switch (outcome.kind) {
      case "cancelled":
      case "already_cancelled":
        return;
      case "already_paid":
        throw new OrderNotCancellableError(subject.orderId, { kind: "paid" });
      case "in_progress":
        throw new OrderCancellationPaymentInProgressError(subject.orderId);
      case "unavailable":
        this.logger.warn(`Annulation non écrite (commande ${subject.orderId}) : ${outcome.reason}`);
        throw new OrderCancellationProviderUnavailableError(subject.orderId);
    }
  }

  /** La transaction, rejouée une fois si Stripe a déjà fermé l'intention (C3.4 ter). */
  private async recordOnce(
    command: CancelOrderCommand,
    reason: CancellationReason,
    intentClosed: boolean,
  ): Promise<void> {
    try {
      await this.record(command, reason);
    } catch (first) {
      if (!intentClosed || isRefusal(first)) {
        throw first;
      }
      this.logger.warn(`Annulation rejouée après fermeture Stripe (commande ${command.orderId})`);
      try {
        await this.record(command, reason);
      } catch (second) {
        if (isRefusal(second)) {
          throw second;
        }
        throw new OrderCancellationNotRecordedError(command.orderId, second);
      }
    }
  }

  private async record(command: CancelOrderCommand, reason: CancellationReason): Promise<void> {
    await this.unitOfWork.run(async () => {
      const locked = await this.cancellations.lock(command.orderId);
      if (locked === null) {
        throw new OrderNotFoundError(command.orderId);
      }
      const regime = this.ensureCancellable(locked);
      await this.withdrawFromBakery(locked);
      const now = this.clock.now();
      const written = await this.cancellations.cancel(locked.orderId, {
        cancelledBy: command.staffUserId,
        reason: reason.value,
        cancelledAt: now,
      });
      if (!written) {
        // Sous le verrou, la règle venait de laisser passer : ne pas franchir
        // veut dire un état que le `where` refuse. On le relit pour le nommer,
        // et le refus annule tout, retrait au fournil compris.
        const again = (await this.cancellations.lock(locked.orderId)) ?? locked;
        this.ensureCancellable(again);
        throw new OrderNotCancellableError(locked.orderId, { kind: "already_cancelled", at: null });
      }
      await this.afterCancelled(locked, command.staffUserId, reason, regime, now);
    });
  }

  /** Le retrait au fournil, sous le verrou de la journée ; « inscrite » refuse et annule tout. */
  private async withdrawFromBakery(locked: CancellationSubject): Promise<void> {
    // Sans jour de service, une commande n'est jamais producible (`planWhere`
    // lit `requested_delivery_date`) : il n'y a rien à retirer.
    if (locked.serviceDay === null) {
      return;
    }
    const outcome = await this.desk.withdraw(ServiceDay.of(locked.serviceDay), locked.orderId);
    if (outcome === "inscribed") {
      throw new OrderNotCancellableError(locked.orderId, {
        kind: "inscribed",
        day: locked.serviceDay,
      });
    }
  }

  /** Le bon rendu et le fait durable — seulement quand l'écriture a franchi. */
  private async afterCancelled(
    locked: CancellationSubject,
    staffUserId: string,
    reason: CancellationReason,
    regime: CancellableRegime,
    now: Date,
  ): Promise<void> {
    if (locked.loyaltyVoucherId !== null) {
      await this.vouchers.release(locked.loyaltyVoucherId, now);
    }
    await this.durable.publish(
      new OrderCancelledEvent(
        locked.orderId,
        locked.orderNumber,
        locked.placedByUserId,
        staffUserId,
        reason.value,
        regime,
        locked.loyaltyVoucherId !== null,
      ).durableFact(),
    );
  }
}

/** Un refus dit la même chose au second essai : on ne le rejoue pas. */
function isRefusal(error: unknown): boolean {
  return error instanceof DomainError || error instanceof BusinessError;
}

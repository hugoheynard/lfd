import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  PaymentGateway,
  type IntentCancellation,
} from "../../../payments/domain/payment-gateway.js";
import {
  OrderAbandonUnavailableError,
  OrderNotAbandonableError,
  OrderPaymentAlreadyReceivedError,
  OrderPaymentInProgressError,
} from "../../domain/errors/order-abandon-errors.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderAbandonedEvent } from "../../domain/events/order-abandoned.event.js";
import { OrderPaymentFailedEvent } from "../../domain/events/order-payment-failed.event.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderReader, type OwnedOrder } from "../../domain/ports/order.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { ensureOrderVisible } from "../../domain/services/order-access.js";
import { abandonStanding, ensureOrderAuthor } from "../../domain/services/order-abandon.js";
import { AbandonOrderCommand } from "./abandon-order.command.js";

/**
 * **Abandonner le règlement** d'une commande — le client quitte l'écran de
 * carte (plan `documentation/order/plan-abandon-du-reglement.md`, D1, D4, §5).
 *
 * ## L'ordre, pour un particulier : Stripe d'abord, la base ensuite
 *
 * Annuler chez nous une commande dont l'intention vit encore laisserait une
 * carte la payer — une annulée encaissée. On annule donc l'intention, et on
 * n'écrit que si Stripe confirme qu'elle est morte (`cancelled`, ou
 * `already_cancelled` : le second clic). Sinon rien n'est écrit, et le refus
 * nomme pourquoi : payée (le webhook suit), en cours, ou Stripe injoignable.
 *
 * ## Un pro ne touche pas Stripe (Q8, tranché par Hugo le 2026-09-26 : a)
 *
 * Pour un pro — et une clientèle inconnue, traitée comme lui — l'intention
 * **reste vivante** : la commande passe `failed`, reste `placed`, et demeure
 * payable jusqu'à la clôture, qui l'annulera (Q7). L'annuler chez Stripe
 * l'aurait rendue impayable (la page de règlement refuse une intention morte,
 * et aucune nouvelle n'est créée), ce qui contredisait D4. Aucun appel au
 * prestataire, donc aucun refus « Stripe injoignable » pour lui.
 *
 * ⚠️ Le trou que cet ordre ne ferme pas — Stripe annule, puis notre écriture
 * se perd — est tenu ailleurs : la page de règlement relit l'intention et
 * refuse une intention morte, et la clôture balaie la commande (§5).
 *
 * ## Idempotent
 *
 * Une commande déjà annulée répond comme la première fois, sans rappeler
 * Stripe. Un second clic sur une commande pro trouve un règlement déjà
 * `failed` : le dépôt n'écrit rien, aucun fait n'est republié.
 */
@CommandHandler(AbandonOrderCommand)
export class AbandonOrderHandler implements ICommandHandler<AbandonOrderCommand, void> {
  private readonly logger = new Logger(AbandonOrderHandler.name);

  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: OrderReader,
    private readonly repository: OrderRepository,
    private readonly payments: PaymentGateway,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: AbandonOrderCommand): Promise<void> {
    const owned = await this.authorsOrder(command);
    const standing = abandonStanding(owned.view.status, owned.view.paymentStatus);
    if (standing === "already_abandoned") {
      return;
    }
    if (standing !== "abandon") {
      throw new OrderNotAbandonableError(standing);
    }
    if (owned.clientele === "public" && owned.stripePaymentIntentId !== null) {
      const outcome = await this.payments.cancelIntent(owned.stripePaymentIntentId);
      this.ensureIntentDead(outcome, command.orderId);
    }

    const written = await this.repository.markAbandoned(command.orderId);
    if (written === null) {
      return;
    }
    this.events.publish(new OrderPaymentFailedEvent(command.orderId, "abandoned"));
    this.events.publish(
      new OrderAbandonedEvent(
        command.orderId,
        owned.view.orderNumber,
        owned.placedByUserId,
        written,
      ),
    );
  }

  /** Le mur de lecture d'abord (404 aux étrangers), puis celui de l'auteur (403). */
  private async authorsOrder(command: AbandonOrderCommand): Promise<OwnedOrder> {
    const owned = await this.orders.findById(command.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(command.orderId);
    }
    const role =
      owned.companyId === null
        ? null
        : await this.guard.roleOf(command.actorUserId, owned.companyId);
    ensureOrderVisible(owned, command.actorUserId, role, command.orderId);
    ensureOrderAuthor(owned, command.actorUserId, command.orderId);
    return owned;
  }

  /** Les cinq issues de `cancelIntent` (§5) : deux laissent écrire, trois refusent. */
  private ensureIntentDead(outcome: IntentCancellation, orderId: string): void {
    switch (outcome.kind) {
      case "cancelled":
      case "already_cancelled":
        return;
      case "already_paid":
        throw new OrderPaymentAlreadyReceivedError(orderId);
      case "in_progress":
        throw new OrderPaymentInProgressError(orderId);
      case "unavailable":
        this.logger.warn(`Abandon non écrit (commande ${orderId}) : ${outcome.reason}`);
        throw new OrderAbandonUnavailableError(orderId);
    }
  }
}

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import type { Order } from "../../domain/entities/order.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import { PlaceOrderCommand, type PlaceOrderResult } from "./place-order.command.js";

/** Devise unique de la plateforme (montants en centimes d'euro). */
const CURRENCY = "eur";

/**
 * Passe une commande — **zéro friction**, le client pour lui-même.
 *
 * Le handler **orchestre** ; la composition du panier vit dans {@link OrderDrafting}
 * (prix ré-résolus, acheminement, ajustements) et le **calcul monétaire** dans
 * l'agrégat `Order`. Ne restent ici que les deux décisions propres à ce chemin :
 * - le mur **membre**, SEULEMENT si une entreprise est visée (sinon personnelle) ;
 * - le règlement : `payByCard` si une carte est requise et le total > 0, sinon
 *   `deferPayment`.
 *
 * Pour une carte, l'intention Stripe est créée AVANT la persistance, dimensionnée
 * sur `order.totalCents` : une commande `pending` porte toujours son intent.
 */
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand, PlaceOrderResult> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly drafting: OrderDrafting,
    private readonly orders: OrderRepository,
    private readonly payments: PaymentGateway,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
    const { payload } = command;
    const { companyId } = payload;

    // Mur : rattachée à une entreprise ⇒ il faut en être membre. Personnelle ⇒
    // seul le client connecté la possède, rien à vérifier.
    if (companyId !== null) {
      const role = await this.guard.roleOf(command.actorUserId, companyId);
      ensureOrderMember(role, companyId);
    }

    const order = await this.drafting.draft(
      { companyId, placedByUserId: command.actorUserId, placedByStaffId: null },
      payload,
    );

    const intent = await this.settle(order, companyId);
    const placed = await this.orders.place(order);

    // Fait de domaine, publié APRÈS persistance (on ne journalise pas une commande
    // qui n'a pas pris). Le journal croissance écoute ; l'échec d'un abonné ne
    // remonte pas ici (le recorder est best-effort).
    this.events.publish(
      new OrderPlacedEvent(
        placed.id,
        placed.orderNumber,
        command.actorUserId,
        companyId,
        order.totalCents,
      ),
    );

    if (intent === null) {
      return { id: placed.id, orderNumber: placed.orderNumber };
    }
    return {
      id: placed.id,
      orderNumber: placed.orderNumber,
      payment: {
        clientSecret: intent.clientSecret,
        publishableKey: this.payments.publishableKey(),
        amountCents: order.totalCents,
      },
    };
  }

  /**
   * Décide le règlement de l'agrégat et crée l'intention Stripe si une carte est
   * requise (total > 0). Renvoie l'intention (pour le `clientSecret`) ou `null`
   * (différé / gratuit). L'intention est dimensionnée sur `order.totalCents`.
   */
  private async settle(
    order: Order,
    companyId: string | null,
  ): Promise<{ clientSecret: string } | null> {
    const requiresCard = (await this.requiresCard(companyId)) && order.totalCents > 0;
    if (!requiresCard) {
      order.deferPayment();
      return null;
    }
    const intent = await this.payments.createIntent({
      amountCents: order.totalCents,
      currency: CURRENCY,
      companyId,
    });
    order.payByCard(intent.paymentIntentId);
    return { clientSecret: intent.clientSecret };
  }

  /**
   * Une carte est requise, sauf pour une entreprise **active** à qui un crédit a
   * été accordé — sa commande part alors au compte, facturée au terme.
   *
   * Sans entreprise, ou entreprise non activée : carte. Le crédit se négocie
   * avec une société cliente, pas avec un panier.
   */
  private async requiresCard(companyId: string | null): Promise<boolean> {
    if (companyId === null) {
      return true;
    }
    const status = await this.guard.companyStatusOf(companyId);
    if (status !== "active") {
      return true;
    }
    return !(await this.guard.settlesOnAccount(companyId));
  }
}

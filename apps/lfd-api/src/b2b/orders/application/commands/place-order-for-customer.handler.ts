import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import type { Order } from "../../domain/entities/order.js";
import { AccountSettlementNotGrantedError } from "../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import { paymentUrlFor } from "../../domain/services/payment-link.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import {
  PlaceOrderForCustomerCommand,
  type PlaceOrderForCustomerResult,
} from "./place-order-for-customer.command.js";

/** Devise unique de la plateforme (montants en centimes d'euro). */
const CURRENCY = "eur";

/**
 * Passe une commande **au nom d'un client**, depuis le back-office.
 *
 * Le panier se compose exactement comme celui du client ({@link OrderDrafting}) —
 * mêmes prix ré-résolus, même remise de retrait, même zone déduite du code
 * postal. Deux choses seulement diffèrent, et ce sont les deux raisons d'être de
 * ce handler :
 *
 * 1. **Le mur porte sur l'acheteur, pas sur l'acteur.** Un commercial n'est
 *    membre d'aucune société cliente : vérifier SON appartenance n'aurait aucun
 *    sens. C'est `buyerUserId` — la personne au nom de qui la commande est
 *    portée — qui doit être membre. Il vient du corps de la requête, donc il se
 *    vérifie ; le droit d'être là, lui, a déjà été tranché par la porte staff.
 *
 * 2. **Aucune carte n'est saisie ici.** Le règlement au compte est refusé si la
 *    société n'a pas de crédit ; sinon on crée une intention et on rend un
 *    **lien** que le client suivra lui-même. Un numéro de carte dicté au
 *    téléphone et tapé par un commercial est précisément ce qu'on n'autorise pas.
 */
@CommandHandler(PlaceOrderForCustomerCommand)
export class PlaceOrderForCustomerHandler implements ICommandHandler<
  PlaceOrderForCustomerCommand,
  PlaceOrderForCustomerResult
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly drafting: OrderDrafting,
    private readonly orders: OrderRepository,
    private readonly payments: PaymentGateway,
    private readonly events: DomainEventPublisher,
    private readonly config: AppConfig,
  ) {}

  async execute(command: PlaceOrderForCustomerCommand): Promise<PlaceOrderForCustomerResult> {
    const { payload } = command;
    const { companyId, buyerUserId } = payload;

    // Le mur : l'acheteur désigné doit appartenir à la société. Un 404
    // non-divulguant sinon, comme sur le chemin client — le back-office n'a pas
    // besoin d'un message plus bavard, il a la fiche sous les yeux.
    const role = await this.guard.roleOf(buyerUserId, companyId);
    ensureOrderMember(role, companyId);

    const order = await this.drafting.draft(
      { companyId, placedByUserId: buyerUserId, placedByStaffId: command.staffUserId },
      payload,
    );

    const intent = await this.settle(order, payload.settlement, companyId);
    const placed = await this.orders.place(order);

    // Le fait de domaine porte l'ACHETEUR, pas le commercial : c'est bien ce
    // client-là qui vient de commander, et le journal croissance compte des
    // clients. Qui a saisi est sur la commande, où c'est une trace, pas un signal.
    this.events.publish(
      new OrderPlacedEvent(placed.id, placed.orderNumber, buyerUserId, companyId, order.totalCents),
    );

    const paymentUrl =
      intent === null ? undefined : paymentUrlFor(this.config.clientBaseUrl(), placed.id);
    return {
      id: placed.id,
      orderNumber: placed.orderNumber,
      settlement: payload.settlement,
      totalCents: order.totalCents,
      ...(paymentUrl === null || paymentUrl === undefined ? {} : { paymentUrl }),
    };
  }

  /**
   * Décide le règlement. `account` exige un crédit réellement accordé — sans quoi
   * un écran de back-office suffirait à en inventer un. `link` crée l'intention
   * Stripe, sauf sur un total nul où il n'y a rien à encaisser.
   */
  private async settle(
    order: Order,
    settlement: PlaceOrderForCustomerCommand["payload"]["settlement"],
    companyId: string,
  ): Promise<{ clientSecret: string } | null> {
    if (settlement === "account") {
      await this.ensureSettlesOnAccount(companyId);
      order.deferPayment();
      return null;
    }
    if (order.totalCents <= 0) {
      // Rien à encaisser : un lien de règlement à 0 € enverrait le client sur une
      // page qui n'a rien à lui demander.
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

  /** Le crédit se négocie société par société : il se constate, il ne se suppose pas. */
  private async ensureSettlesOnAccount(companyId: string): Promise<void> {
    const status = await this.guard.companyStatusOf(companyId);
    if (status !== "active" || !(await this.guard.settlesOnAccount(companyId))) {
      throw new AccountSettlementNotGrantedError();
    }
  }
}

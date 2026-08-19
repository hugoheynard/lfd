import type { OrderPaymentIntent } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import { OrderNotFoundError, OrderNotPayableError } from "../../domain/errors/order-errors.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ensureOrderVisible } from "../../domain/services/order-access.js";
import { GetOrderPaymentQuery } from "./get-order-payment.query.js";

/**
 * Rend de quoi régler une commande **en attente de paiement**.
 *
 * Le mur est celui de la lecture d'une commande — c'est le même droit : qui peut
 * la voir peut la payer. Pas un droit de plus : un membre qui règle la commande
 * d'un collègue rend service, il ne s'attribue rien.
 *
 * Le `clientSecret` est **redemandé au prestataire** plutôt que relu d'une
 * colonne : nous ne stockons que l'identifiant de l'intention, et c'est ce qui
 * évite qu'un secret vieillisse dans notre base.
 */
@QueryHandler(GetOrderPaymentQuery)
export class GetOrderPaymentHandler implements IQueryHandler<
  GetOrderPaymentQuery,
  OrderPaymentIntent
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: OrderReader,
    private readonly payments: PaymentGateway,
  ) {}

  async execute(query: GetOrderPaymentQuery): Promise<OrderPaymentIntent> {
    const owned = await this.orders.findById(query.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const role =
      owned.companyId === null ? null : await this.guard.roleOf(query.actorUserId, owned.companyId);
    ensureOrderVisible(owned, query.actorUserId, role, query.orderId);

    // Deux refus distincts, et ils se disent différemment : une commande déjà
    // réglée ou portée au compte n'a rien à encaisser (`paid`, `not_required`),
    // tandis qu'une commande `pending` sans intention est une anomalie. Les
    // confondre ferait passer un état normal pour une panne.
    if (owned.view.paymentStatus !== "pending" || owned.stripePaymentIntentId === null) {
      throw new OrderNotPayableError(owned.view.paymentStatus);
    }

    const intent = await this.payments.retrieveIntent(owned.stripePaymentIntentId);
    return {
      clientSecret: intent.clientSecret,
      publishableKey: this.payments.publishableKey(),
      amountCents: owned.view.totalCents,
    };
  }
}

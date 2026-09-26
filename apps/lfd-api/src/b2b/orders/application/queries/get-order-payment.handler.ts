import type { OrderPaymentIntent } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import { OrderNotFoundError, OrderNotPayableError } from "../../domain/errors/order-errors.js";
import {
  CancelledOrderNotPayableError,
  PaymentIntentClosedError,
} from "../../domain/errors/order-payment-errors.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ensureOrderVisible } from "../../domain/services/order-access.js";
import { awaitsCardPayment } from "../../domain/services/payment-link.js";
import { GetOrderPaymentQuery } from "./get-order-payment.query.js";

/**
 * Rend de quoi régler une commande **en attente de paiement**, ou dont le
 * règlement a **échoué et reste à reprendre**.
 *
 * `failed` est admis depuis le 2026-09-26 (plan
 * `documentation/order/plan-abandon-du-reglement.md`, lot 3 bis, §9 bis B3 et
 * Q8 a) : une carte refusée rend l'intention à `requires_payment_method`, et un
 * pro qui abandonne garde une intention non annulée — dans les deux cas le
 * client peut encore payer. Le lien de paiement le déclarait déjà « à
 * reprendre » (`awaitsCardPayment`, `domain/services/payment-link.ts`, vérifié
 * le 2026-09-26) ; la page le refusait, et le lien menait à un refus. Aucune
 * nouvelle intention n'est jamais créée : seule l'intention d'origine, et
 * seulement tant qu'elle est vivante chez Stripe (relue plus bas).
 *
 * Le mur est celui de la lecture d'une commande — c'est le même droit : qui peut
 * la voir peut la payer. Pas un droit de plus : un membre qui règle la commande
 * d'un collègue rend service, il ne s'attribue rien.
 *
 * Le `clientSecret` est **redemandé au prestataire** plutôt que relu d'une
 * colonne : nous ne stockons que l'identifiant de l'intention, et c'est ce qui
 * évite qu'un secret vieillisse dans notre base.
 *
 * Ce qui est relu, c'est aussi l'**état** de l'intention : notre base peut
 * croire une commande en attente alors que Stripe a déjà annulé l'intention
 * (une annulation réussie chez Stripe puis une écriture perdue chez nous) ou
 * déjà encaissé (le webhook n'est pas encore arrivé). Dans les deux cas le
 * secret ne se sert pas (plan `documentation/order/plan-abandon-du-reglement.md`,
 * §5 « Le trou que l'ordre ne ferme pas » et §9 bis, B3).
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

    // Avant le règlement : une commande annulée ne se paie plus, quel que soit
    // ce que dit sa colonne de paiement.
    if (owned.view.status === "cancelled") {
      throw new CancelledOrderNotPayableError(query.orderId);
    }

    // Deux refus distincts, et ils se disent différemment : une commande déjà
    // réglée, portée au compte ou remboursée n'a rien à encaisser (`paid`,
    // `not_required`, `refunded`), tandis qu'une commande `pending` ou `failed`
    // sans intention est une anomalie. La règle est celle du lien de paiement.
    if (
      !awaitsCardPayment(owned.view.status, owned.view.paymentStatus) ||
      owned.stripePaymentIntentId === null
    ) {
      throw new OrderNotPayableError(owned.view.paymentStatus);
    }

    const intent = await this.payments.retrieveIntent(owned.stripePaymentIntentId);
    if (intent.state === "canceled" || intent.state === "succeeded") {
      throw new PaymentIntentClosedError(intent.state);
    }
    return {
      clientSecret: intent.clientSecret,
      publishableKey: this.payments.publishableKey(),
      amountCents: owned.view.totalCents,
    };
  }
}

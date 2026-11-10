import type { OrderAwaitingPaymentView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import {
  OrderPaymentLinkReader,
  type OrderPaymentStanding,
} from "../../domain/ports/order-payment-link.reader.js";
import { paymentUrlFor } from "../../domain/services/payment-link.js";
import { ListOrdersAwaitingPaymentQuery } from "./list-orders-awaiting-payment.query.js";

/**
 * Les commandes à régler, chacune avec son **lien de règlement** — le même
 * que celui de la passation back-office (`paymentUrlFor`). `null` quand
 * `CLIENT_BASE_URL` manque : l'écran n'affiche pas de lien plutôt qu'un lien
 * vers nulle part.
 */
@QueryHandler(ListOrdersAwaitingPaymentQuery)
export class ListOrdersAwaitingPaymentHandler implements IQueryHandler<
  ListOrdersAwaitingPaymentQuery,
  readonly OrderAwaitingPaymentView[]
> {
  constructor(
    private readonly reader: OrderPaymentLinkReader,
    private readonly origins: OrderMailOrigins,
  ) {}

  async execute(): Promise<readonly OrderAwaitingPaymentView[]> {
    const client = this.origins.clientBaseUrl();
    const standings = await this.reader.listAwaitingPayment();
    return standings.flatMap((standing) => {
      const view = toView(standing, paymentUrlFor(client, standing.orderId));
      return view === null ? [] : [view];
    });
  }
}

/** `null` si la ligne n'est pas à régler — la lecture filtre déjà ; ceci resserre le type. */
function toView(
  standing: OrderPaymentStanding,
  paymentUrl: string | null,
): OrderAwaitingPaymentView | null {
  const { paymentStatus } = standing;
  if (paymentStatus !== "pending" && paymentStatus !== "failed") {
    return null;
  }
  return {
    orderId: standing.orderId,
    reference: standing.reference,
    companyId: standing.companyId,
    companyName: standing.companyName,
    totalCents: standing.totalCents,
    placedAt: standing.placedAt.toISOString(),
    status: standing.status,
    paymentStatus,
    paymentUrl,
  };
}

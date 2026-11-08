import type { OrderMailsView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ListOrderMailsQuery } from "../application/queries/list-order-mails.query.js";

/**
 * **Les e-mails d'une commande**, vus du staff — modèle, demandé à, état de
 * la demande et retour de Resend, jamais l'adresse (plan
 * `documentation/mail/plan-sujet-des-e-mails.md`, règle 7).
 *
 * Même surface que le détail de commande (`b2b_orders`, lecture par le
 * verbe) ; un contrôleur à part pour ne pas grossir `AdminOrdersController`.
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderMailsController {
  constructor(private readonly queries: QueryBus) {}

  /** `404` nommé si la commande n'existe pas, même si des e-mails portent cet identifiant. */
  @Get(":orderId/mails")
  mails(@Param("orderId") orderId: string): Promise<OrderMailsView> {
    return this.queries.execute<ListOrderMailsQuery, OrderMailsView>(
      new ListOrderMailsQuery(orderId),
    );
  }
}

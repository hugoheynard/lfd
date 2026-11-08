import type { OrderMailView, OrderMailsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  MailSubjectDeliveries,
  type SubjectMail,
} from "../../../../mail/channels/deliveries/mail-subject-deliveries.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderExistenceReader } from "../../domain/ports/order-existence.reader.js";
import { ListOrderMailsQuery } from "./list-order-mails.query.js";

function toOrderMailView(mail: SubjectMail): OrderMailView {
  return {
    id: mail.requestId,
    template: mail.template,
    requestedAt: mail.requestedAt.toISOString(),
    state: mail.state,
    delivery: mail.delivery,
    deliveryAt: mail.deliveryAt === null ? null : mail.deliveryAt.toISOString(),
  };
}

/**
 * **Les e-mails d'une commande** (plan `plan-sujet-des-e-mails.md`, règle 7) :
 * ceux dont la demande nomme cette commande pour sujet, avec leur état réel.
 *
 * La commande se prouve D'ABORD (objection S8 de vitruve) : sans elle, un
 * identifiant arbitraire lirait les e-mails que le bloc `mail` a rangés sous
 * lui. Le bloc ne sait pas ce qu'est une commande ; c'est ici qu'on le sait.
 *
 * @throws {OrderNotFoundError} aucune commande sous cet id.
 */
@QueryHandler(ListOrderMailsQuery)
export class ListOrderMailsHandler implements IQueryHandler<ListOrderMailsQuery, OrderMailsView> {
  constructor(
    private readonly orders: OrderExistenceReader,
    private readonly mails: MailSubjectDeliveries,
  ) {}

  async execute(query: ListOrderMailsQuery): Promise<OrderMailsView> {
    if (!(await this.orders.exists(query.orderId))) {
      throw new OrderNotFoundError(query.orderId);
    }
    const found = await this.mails.forSubjects("order", [query.orderId]);
    return { items: (found.get(query.orderId) ?? []).map(toOrderMailView) };
  }
}

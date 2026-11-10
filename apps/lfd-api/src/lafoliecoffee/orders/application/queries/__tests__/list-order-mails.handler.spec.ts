import {
  MailSubjectDeliveries,
  type SubjectMail,
} from "../../../../../mail/channels/deliveries/mail-subject-deliveries.js";
import type { MailSubjectType } from "../../../../../mail/channels/requests/mail-subject.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderExistenceReader } from "../../../domain/ports/order-existence.reader.js";
import { ListOrderMailsHandler } from "../list-order-mails.handler.js";
import { ListOrderMailsQuery } from "../list-order-mails.query.js";

/** Les commandes connues, par leur identifiant. */
class KnownOrders extends OrderExistenceReader {
  constructor(private readonly ids: readonly string[]) {
    super();
  }

  exists(orderId: string): Promise<boolean> {
    return Promise.resolve(this.ids.includes(orderId));
  }
}

/** Le canal du bloc `mail` doublé : rend ses fiches, et garde ce qu'on lui a demandé. */
class FixedSubjectDeliveries extends MailSubjectDeliveries {
  readonly asked: { readonly type: MailSubjectType; readonly ids: readonly string[] }[] = [];

  constructor(private readonly mails: ReadonlyMap<string, readonly SubjectMail[]>) {
    super();
  }

  forSubjects(
    type: MailSubjectType,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, readonly SubjectMail[]>> {
    this.asked.push({ type, ids });
    return Promise.resolve(this.mails);
  }
}

const REQUESTED_AT = new Date(Date.UTC(2026, 0, 1, 8));
const DELIVERED_AT = new Date(Date.UTC(2026, 0, 1, 8, 2));

const PLACED: SubjectMail = {
  requestId: "mail_1",
  template: "customer.order-placed",
  requestedAt: REQUESTED_AT,
  state: "accepted",
  delivery: "delivered",
  deliveryAt: DELIVERED_AT,
};

describe("ListOrderMailsHandler", () => {
  it("rend les e-mails de la commande, leurs états en codes anglais et leurs instants ISO", async () => {
    const mails = new FixedSubjectDeliveries(new Map([["ord_1", [PLACED]]]));
    const handler = new ListOrderMailsHandler(new KnownOrders(["ord_1"]), mails);

    await expect(handler.execute(new ListOrderMailsQuery("ord_1"))).resolves.toEqual({
      items: [
        {
          id: "mail_1",
          template: "customer.order-placed",
          requestedAt: REQUESTED_AT.toISOString(),
          state: "accepted",
          delivery: "delivered",
          deliveryAt: DELIVERED_AT.toISOString(),
        },
      ],
    });
    expect(mails.asked).toEqual([{ type: "order", ids: ["ord_1"] }]);
  });

  it("une commande sans e-mail rend une liste vide", async () => {
    const handler = new ListOrderMailsHandler(
      new KnownOrders(["ord_1"]),
      new FixedSubjectDeliveries(new Map()),
    );

    await expect(handler.execute(new ListOrderMailsQuery("ord_1"))).resolves.toEqual({ items: [] });
  });

  /** Objection S8 de vitruve : un identifiant arbitraire ne lit rien chez `mail`. */
  it("404 nommé pour une commande inconnue, sans même interroger le bloc mail", async () => {
    const mails = new FixedSubjectDeliveries(new Map([["ord_x", [PLACED]]]));
    const handler = new ListOrderMailsHandler(new KnownOrders([]), mails);

    await expect(handler.execute(new ListOrderMailsQuery("ord_x"))).rejects.toThrow(
      OrderNotFoundError,
    );
    expect(mails.asked).toEqual([]);
  });
});

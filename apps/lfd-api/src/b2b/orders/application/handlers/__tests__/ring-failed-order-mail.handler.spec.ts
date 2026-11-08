import {
  MailDeliveryFailedEvent,
  type MailDeliveryFailedFields,
} from "../../../../../mail/channels/deliveries/mail-delivery-failed.event.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { OrderNumberReader } from "../../../domain/ports/order-number.reader.js";
import {
  FAILED_ORDER_MAIL_BELL,
  failedOrderMailKey,
  RingFailedOrderMail,
} from "../ring-failed-order-mail.handler.js";

/** L'instant de la cloche : recopié, comparé à aucune horloge. */
const AT = new Date(0);

/** La cloche dédoublonnée par clé, comme le magasin des notices. */
class DedupingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    for (const notice of notices) {
      if (!this.notices.some((kept) => kept.idempotencyKey === notice.idempotencyKey)) {
        this.notices.push(notice);
      }
    }
    return Promise.resolve();
  }
}

class KnownOrderNumbers extends OrderNumberReader {
  constructor(private readonly known: ReadonlyMap<string, string>) {
    super();
  }

  numbersOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(
      new Map([...this.known].filter(([orderId]) => orderIds.includes(orderId))),
    );
  }
}

const FIELDS: MailDeliveryFailedFields = {
  requestId: "mail_1",
  template: "customer.order-ready",
  subjects: [{ type: "order", id: "o1" }],
  delivery: "bounced",
  kind: "Permanent",
  at: new Date(0),
};

function scene() {
  const notifier = new DedupingNotifier();
  const handler = new RingFailedOrderMail(
    notifier,
    new KnownOrderNumbers(
      new Map([
        ["o1", "ORD-4812"],
        ["o2", "ORD-4813"],
      ]),
    ),
    new FixedClock(AT),
  );
  const ring = (fields: MailDeliveryFailedFields = FIELDS): Promise<void> => {
    const fact = new MailDeliveryFailedEvent(fields).durableFact();
    return handler.handle({ eventId: "e", type: fact.type, payload: fact.payload });
  };
  return { notifier, ring };
}

describe("RingFailedOrderMail (plan-sujet-des-e-mails, E4)", () => {
  it("sonne une cloche vers la commande, adressée au droit des commandes, sans adresse", async () => {
    const { notifier, ring } = scene();

    await ring();

    expect(notifier.notices).toEqual([
      {
        kind: FAILED_ORDER_MAIL_BELL,
        subject: "E-mail non reçu — ORD-4812",
        body:
          "L'e-mail « Commande prête » de la commande ORD-4812 n'a pas été reçu : " +
          "adresse rejetée. Vérifiez l'adresse du client.",
        link: "/commandes/o1",
        idempotencyKey: "mail.failed:mail_1:o1",
        occurredAt: AT,
        audience: "b2b_orders:read",
      },
    ]);
    expect(JSON.stringify(notifier.notices)).not.toContain("@");
  });

  it("une plainte dit son geste de sortie", async () => {
    const { notifier, ring } = scene();

    await ring({ ...FIELDS, delivery: "complained" });

    expect(notifier.notices[0]?.body).toContain("signalé comme indésirable");
  });

  it("un rejeu du fait ne sonne pas une seconde fois", async () => {
    const { notifier, ring } = scene();

    await ring();
    await ring();

    expect(notifier.notices).toHaveLength(1);
  });

  it("une cloche par commande nommée ; un sujet qui n'est pas une commande est ignoré", async () => {
    const { notifier, ring } = scene();

    await ring({
      ...FIELDS,
      subjects: [
        { type: "order", id: "o1" },
        { type: "account", id: "acc_1" },
        { type: "order", id: "o2" },
      ],
    });

    expect(notifier.notices.map((notice) => notice.idempotencyKey)).toEqual([
      failedOrderMailKey("mail_1", "o1"),
      failedOrderMailKey("mail_1", "o2"),
    ]);
  });

  it("deux fiches de la même commande (prête, puis son rappel) : deux cloches", async () => {
    const { notifier, ring } = scene();

    await ring();
    await ring({ ...FIELDS, requestId: "mail_2" });

    expect(notifier.notices).toHaveLength(2);
  });

  it("aucun sujet commande : rien ne sonne", async () => {
    const { notifier, ring } = scene();

    await ring({ ...FIELDS, subjects: [{ type: "invoice", id: "inv_1" }] });

    expect(notifier.notices).toEqual([]);
  });

  it("une commande inconnue ne sonne pas sous un numéro inventé", async () => {
    const { notifier, ring } = scene();

    await ring({ ...FIELDS, subjects: [{ type: "order", id: "o_inconnue" }] });

    expect(notifier.notices).toEqual([]);
  });

  it("refuse un fait illisible", async () => {
    const handler = new RingFailedOrderMail(
      new DedupingNotifier(),
      new KnownOrderNumbers(new Map()),
      new FixedClock(AT),
    );

    await expect(
      handler.handle({ eventId: "e", type: "mail.delivery_failed", payload: { requestId: "x" } }),
    ).rejects.toThrow("illisible");
  });
});

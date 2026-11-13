import type {
  CardRefundView,
  SubjectCardRefunds,
} from "../../../../../card-payment/channels/requests/index.js";
import type { CardSubject } from "../../../../../card-payment/channels/subjects/index.js";
import { RecordingMail } from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { ORDER_REFUND_SUCCEEDED } from "../../../domain/events/order-refund-succeeded.fact.js";
import {
  ShortfallRefundedNoticeReader,
  type ShortfallRefundedNotice,
} from "../../../domain/ports/shortfall-refunded-notice.reader.js";
import { SHORTFALL_REFUND_REASON } from "../../../domain/services/shortfall-refunded.js";
import { FixedRecipients } from "../../commands/__tests__/intake-doubles.js";
import {
  cardRefundRequest,
  FixedCardRefundRequests,
} from "../../commands/__tests__/refund-doubles.js";
import { SendShortfallRefundedMail } from "../send-shortfall-refunded-mail.handler.js";

/**
 * « {amount} vous ont été remboursés sur votre carte » (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 7) : au succès
 * d'une part du reste rendue par le prestataire, et à rien d'autre.
 */

/** Instants comparés à rien — exception étroite du § 5. */
const AT = new Date(Date.UTC(2030, 0, 10, 9));

function refund(overrides: Partial<CardRefundView> = {}): CardRefundView {
  return {
    refundId: "ref_1",
    paymentId: "pay_1",
    requestId: "req_1",
    source: "provider",
    status: "succeeded",
    amountCents: 1_140,
    currency: "eur",
    nature: "adjustment",
    refundedAt: AT,
    recordedAt: AT,
    ...overrides,
  };
}

/** Le bloc `card-payment` : les remboursements et les demandes de la commande. */
class CardRefunds extends FixedCardRefundRequests {
  readonly asked: string[] = [];

  constructor(
    private readonly refunds: readonly CardRefundView[],
    reason: string = SHORTFALL_REFUND_REASON,
  ) {
    super([cardRefundRequest({ id: "req_1", form: "amount", nature: "adjustment", reason })]);
  }

  override refundsOf(subjects: readonly CardSubject[]): Promise<readonly SubjectCardRefunds[]> {
    this.asked.push(...subjects.map((subject) => `${subject.type}:${subject.id}`));
    return Promise.resolve(subjects.map((subject) => ({ subject, refunds: this.refunds })));
  }
}

class FixedNotices extends ShortfallRefundedNoticeReader {
  constructor(private readonly notice: ShortfallRefundedNotice | null) {
    super();
  }

  noticeOf(): Promise<ShortfallRefundedNotice | null> {
    return Promise.resolve(this.notice);
  }
}

const NOTICE: ShortfallRefundedNotice = {
  reference: "ORD-0001",
  placedByUserId: "u_1",
  locale: "it",
};

function scene(
  cards: CardRefunds,
  notice: ShortfallRefundedNotice | null = NOTICE,
  emails: Readonly<Record<string, string>> = { u_1: "client@example.test" },
) {
  const mail = new RecordingMail();
  const handler = new SendShortfallRefundedMail(
    cards,
    new FixedNotices(notice),
    new FixedRecipients(emails),
    mail,
  );
  return { mail, handler };
}

function delivery(refundId = "ref_1"): DurableDelivery {
  return {
    eventId: "evt_1",
    type: ORDER_REFUND_SUCCEEDED,
    payload: { orderId: "ord_1", refundId },
  };
}

describe("SendShortfallRefundedMail", () => {
  it("écrit au client le montant de la part rendue, dans la langue de la commande", async () => {
    const cards = new CardRefunds([refund()]);
    const { mail, handler } = scene(cards);

    await handler.handle(delivery());

    expect(cards.asked).toEqual(["order:ord_1"]);
    expect(mail.queued).toEqual([
      {
        to: "client@example.test",
        template: "customer.order-shortfall-refunded",
        data: { reference: "ORD-0001", amountCents: 1_140, locale: "it" },
        idempotencyKey: "customer.order-shortfall-refunded:ref_1",
        subjects: [{ type: "order", id: "ord_1" }],
      },
    ]);
    expect(mail.awaitedReceipt).toEqual([]);
  });

  it("une part = un courriel : la clé porte le remboursement, jamais l'adresse", async () => {
    const cards = new CardRefunds([refund(), refund({ refundId: "ref_2", amountCents: 300 })]);
    const { mail, handler } = scene(cards);

    await handler.handle(delivery("ref_1"));
    await handler.handle(delivery("ref_2"));

    expect(mail.queued.map((sent) => [sent.idempotencyKey, sent.data])).toEqual([
      [
        "customer.order-shortfall-refunded:ref_1",
        { reference: "ORD-0001", amountCents: 1_140, locale: "it" },
      ],
      [
        "customer.order-shortfall-refunded:ref_2",
        { reference: "ORD-0001", amountCents: 300, locale: "it" },
      ],
    ]);
    expect(mail.queued.every((sent) => !sent.idempotencyKey.includes("@"))).toBe(true);
  });

  it("parle français à une commande sans langue", async () => {
    const { mail, handler } = scene(new CardRefunds([refund()]), { ...NOTICE, locale: null });

    await handler.handle(delivery());

    expect(mail.queued[0]?.data).toMatchObject({ locale: "fr" });
  });

  it("n'écrit rien pour « Réglé autrement »", async () => {
    const { mail, handler } = scene(new CardRefunds([refund({ source: "manual" })]));

    await handler.handle(delivery());

    expect(mail.queued).toEqual([]);
  });

  it("n'écrit rien pour un remboursement d'une autre raison (une baisse de révision)", async () => {
    const { mail, handler } = scene(new CardRefunds([refund()], "revision"));

    await handler.handle(delivery());

    expect(mail.queued).toEqual([]);
  });

  it("n'écrit rien sans commande ni destinataire : l'argent est rendu, le courriel manque", async () => {
    const orphan = scene(new CardRefunds([refund()]), null);
    const unreachable = scene(new CardRefunds([refund()]), NOTICE, {});

    await orphan.handler.handle(delivery());
    await unreachable.handler.handle(delivery());

    expect(orphan.mail.queued).toEqual([]);
    expect(unreachable.mail.queued).toEqual([]);
  });

  it("laisse remonter un refus de la porte : la boîte d'envoi relance", async () => {
    const { mail, handler } = scene(new CardRefunds([refund()]));
    mail.failWith = new TypeError("porte fermée");

    await expect(handler.handle(delivery())).rejects.toThrow("porte fermée");
  });

  it("refuse un fait hors forme", async () => {
    const { handler } = scene(new CardRefunds([refund()]));

    await expect(
      handler.handle({
        eventId: "evt_1",
        type: ORDER_REFUND_SUCCEEDED,
        payload: { orderId: "ord_1" },
      }),
    ).rejects.toThrow();
  });
});

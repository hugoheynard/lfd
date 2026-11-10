import { CardPaymentUnmatchedFact } from "../../../../../card-payment/channels/facts/index.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { OnRefundWithoutOrder } from "../on-refund-without-order.handler.js";

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

const NOW = new Date(0);
/** Comparé à rien : recopié tel quel au journal. */
const STRIPE_AT = new Date("2030-01-10T09:00:00.000Z");

function deliveryOf(fact: CardPaymentUnmatchedFact) {
  const durable = fact.durableFact();
  return { eventId: "out_1", type: durable.type, payload: durable.payload };
}

function build() {
  const journal = new RecordingJournal();
  const notifier = new RecordingNotifier();
  const handler = new OnRefundWithoutOrder(journal, notifier, new FixedClock(NOW));
  return { journal, notifier, handler };
}

/**
 * Arbitrage A11 : un remboursement de lien libre est noté, et la cloche sonne.
 * Depuis le lot P0.c2 du plan M2, il arrive par `card_payment.unmatched`.
 */
describe("OnRefundWithoutOrder", () => {
  it("note le remboursement au journal sous son `re_…`, et sonne une fois par remboursement", async () => {
    const { journal, notifier, handler } = build();

    await handler.handle(
      deliveryOf(
        new CardPaymentUnmatchedFact("lfc-stripe", "evt_1", "refund.created", "pi_lien", {
          refundId: "re_libre",
          amountCents: 4_000,
          currency: "eur",
          status: "succeeded",
          refundedAt: STRIPE_AT,
        }),
      ),
    );

    expect(journal.facts).toEqual([
      {
        type: "payment_refund.unmatched",
        subjectType: "payment_refund",
        subjectId: "re_libre",
        payload: {
          amountCents: 4_000,
          currency: "eur",
          status: "succeeded",
          refundedAt: STRIPE_AT.toISOString(),
        },
      },
    ]);
    expect(notifier.notices).toEqual([
      expect.objectContaining({
        kind: "payment_refund.unmatched",
        link: "/comptabilite/liens-de-paiement",
        idempotencyKey: "notification:payment_refund.unmatched:re_libre",
      }) as StaffNotice,
    ]);
  });

  it("ne sonne PAS sur un événement hors de nos sujets qui n'est pas un remboursement", async () => {
    const { journal, notifier, handler } = build();

    await handler.handle(
      deliveryOf(
        new CardPaymentUnmatchedFact("lfc-stripe", "evt_2", "charge.succeeded", null, null),
      ),
    );

    expect(journal.facts).toEqual([]);
    expect(notifier.notices).toEqual([]);
  });
});

import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { RefundWithoutOrderEvent } from "../../../../orders/domain/events/refund-without-order.event.js";
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

/** Arbitrage A11 : un remboursement de lien libre est noté, et la cloche sonne. */
describe("OnRefundWithoutOrder", () => {
  it("note le remboursement au journal sous son `re_…`, et sonne une fois par remboursement", async () => {
    const journal = new RecordingJournal();
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();

    new OnRefundWithoutOrder(journal, notifier, new FixedClock(NOW), work).handle(
      new RefundWithoutOrderEvent({
        stripeRefundId: "re_libre",
        amountCents: 4_000,
        currency: "eur",
        status: "succeeded",
        refundedAt: STRIPE_AT,
      }),
    );
    await work.whenIdle();

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
});

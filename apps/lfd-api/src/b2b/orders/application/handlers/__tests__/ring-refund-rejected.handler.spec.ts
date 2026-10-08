import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { OrderRefundRejectedEvent } from "../../../domain/events/order-refund-rejected.event.js";
import { RingRefundRejected } from "../ring-refund-rejected.handler.js";

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

class BrokenNotifier extends StaffNotifier {
  notify(): Promise<void> {
    return Promise.reject(new Error("cloche indisponible"));
  }
}

const NOW = new Date(0);
const REJECTED = new OrderRefundRejectedEvent("ord_1", "CMD-1", "re_9", 1_250, "exceeds_charge");

/** Lot R1 : un remboursement refusé par la commande se VOIT, au back-office. */
describe("RingRefundRejected", () => {
  it("sonne avec la commande, le montant et le motif, une clé par remboursement", async () => {
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();

    new RingRefundRejected(notifier, new FixedClock(NOW), work).handle(REJECTED);
    await work.whenIdle();

    expect(notifier.notices).toEqual([
      {
        kind: "order.refund_rejected",
        subject: "Remboursement Stripe non noté — CMD-1",
        body: expect.stringContaining("dépasseraient ce qui a été encaissé") as string,
        link: "/commandes/ord_1",
        idempotencyKey: "notification:order.refund_rejected:re_9:exceeds_charge",
        occurredAt: NOW,
      },
    ]);
    expect(notifier.notices[0]?.body).toContain("12,50");
  });

  it("une cloche en panne ne remonte pas : le webhook a déjà répondu", async () => {
    const work = new BackgroundWork();

    new RingRefundRejected(new BrokenNotifier(), new FixedClock(NOW), work).handle(REJECTED);

    await expect(work.whenIdle()).resolves.toBeUndefined();
  });
});

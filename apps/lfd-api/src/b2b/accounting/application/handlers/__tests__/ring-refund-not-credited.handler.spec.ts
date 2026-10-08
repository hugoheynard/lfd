import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { RefundNotCreditedEvent } from "../../../domain/events/refund-not-credited.event.js";
import { RingRefundNotCredited } from "../ring-refund-not-credited.handler.js";

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
const EVENT = new RefundNotCreditedEvent(
  "ord_1",
  "CMD-1",
  "ref_1",
  1_250,
  "FA-2026-000004",
  "account_invoice",
);

/** Lot E5b : un remboursement réussi qu'aucun avoir automatique ne constate se VOIT. */
describe("RingRefundNotCredited", () => {
  it("sonne avec la commande, le montant, la facture, une clé par remboursement", async () => {
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();

    new RingRefundNotCredited(notifier, new FixedClock(NOW), work).handle(EVENT);
    await work.whenIdle();

    expect(notifier.notices).toEqual([
      {
        kind: "order.refund_not_credited",
        subject: "Remboursement sans avoir — CMD-1",
        body: expect.stringContaining("facture du mois") as string,
        link: "/commandes/ord_1",
        idempotencyKey: "notification:order.refund_not_credited:ref_1",
        occurredAt: NOW,
      },
    ]);
    expect(notifier.notices[0]?.body).toContain("FA-2026-000004");
  });

  it("une cloche en panne ne remonte pas", async () => {
    const work = new BackgroundWork();

    new RingRefundNotCredited(new BrokenNotifier(), new FixedClock(NOW), work).handle(EVENT);

    await expect(work.whenIdle()).resolves.toBeUndefined();
  });
});

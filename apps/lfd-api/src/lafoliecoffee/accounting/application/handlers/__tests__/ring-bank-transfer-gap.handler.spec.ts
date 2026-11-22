import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { BankTransferGapFoundEvent } from "../../../domain/events/bank-transfer-gap.event.js";
import { RingBankTransferGap } from "../ring-bank-transfer-gap.handler.js";

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

class BrokenNotifier extends StaffNotifier {
  notify(): Promise<void> {
    return Promise.reject(new RangeError("cloche indisponible"));
  }
}

const NOW = new Date(0);
const EVENT = new BankTransferGapFoundEvent({
  kind: "order_without_allocation",
  transferId: "vir_1",
  invoiceId: "inv_1",
  invoiceNumber: "FA-LFD-2026-000004",
  orderId: "o1",
});

describe("RingBankTransferGap — « virement reçu incohérent »", () => {
  it("sonne en nommant le virement, la facture et le bon, une clé par écart", async () => {
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();

    new RingBankTransferGap(notifier, new FixedClock(NOW), work).handle(EVENT);
    await work.whenIdle();

    expect(notifier.notices).toEqual([
      {
        kind: "bank_transfer.inconsistent",
        subject: "Virement reçu incohérent — vir_1",
        body: expect.stringContaining("FA-LFD-2026-000004") as string,
        link: "/comptabilite/virements-en-retard",
        idempotencyKey:
          "notification:bank_transfer.inconsistent:order_without_allocation:vir_1:inv_1:o1",
        occurredAt: NOW,
      },
    ]);
    expect(notifier.notices[0]?.body).toContain("bon o1");
    expect(notifier.notices[0]?.body).toContain("Rien n'a été corrigé");
  });

  it("une cloche en panne ne remonte pas", async () => {
    const work = new BackgroundWork();

    new RingBankTransferGap(new BrokenNotifier(), new FixedClock(NOW), work).handle(EVENT);

    await expect(work.whenIdle()).resolves.toBeUndefined();
  });
});

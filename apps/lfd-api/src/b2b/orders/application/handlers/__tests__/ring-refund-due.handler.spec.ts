import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { OrderPaidAfterCancellationEvent } from "../../../domain/events/order-paid-after-cancellation.event.js";
import {
  FailedSettlementReader,
  type FailedSettlementSubject,
} from "../../../domain/ports/failed-settlement.reader.js";
import { RingRefundDue } from "../ring-refund-due.handler.js";
import { ImmediateWork } from "./payment-failure-doubles.js";

class OneSubject extends FailedSettlementReader {
  constructor(private readonly subject: FailedSettlementSubject | null) {
    super();
  }

  subjectOf(): Promise<FailedSettlementSubject | null> {
    return Promise.resolve(this.subject);
  }
}

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

/** Garde la tâche lancée, pour qu'on puisse l'attendre et voir comment elle finit. */
class CapturingWork extends BackgroundWork {
  readonly tasks: Promise<void>[] = [];

  override track(task: Promise<void>): Promise<void> {
    this.tasks.push(task);
    return task;
  }
}

const NOW = new Date(0);
const PUBLIC: FailedSettlementSubject = {
  orderNumber: "ORD-5",
  clientele: "public",
  companyName: null,
};

async function ring(subject: FailedSettlementSubject | null): Promise<readonly StaffNotice[]> {
  const notifier = new RecordingNotifier();
  new RingRefundDue(
    new OneSubject(subject),
    notifier,
    new FixedClock(NOW),
    new ImmediateWork(),
  ).handle(new OrderPaidAfterCancellationEvent("order_5"));
  await new Promise((resolve) => setImmediate(resolve));
  return notifier.notices;
}

/** Lot 6 bis : de l'argent reçu pour une commande annulée se rembourse. */
describe("RingRefundDue", () => {
  it("sonne « à rembourser » pour un particulier aussi : c'est de l'argent à rendre", async () => {
    const notices = await ring(PUBLIC);

    expect(notices).toEqual([
      {
        kind: "order.paid_after_cancellation",
        subject: "Encaissé sur une commande annulée — ORD-5",
        body: expect.stringContaining("à rembourser") as string,
        link: "/commandes/order_5",
        idempotencyKey: "notification:order.paid_after_cancellation:order_5",
        occurredAt: NOW,
      },
    ]);
  });

  it("nomme la société d'un pro", async () => {
    const notices = await ring({ ...PUBLIC, clientele: "pro", companyName: "Hôtel des Cimes" });

    expect(notices[0]?.subject).toBe("Encaissé sur une commande annulée — Hôtel des Cimes");
  });

  it("ne sonne pas pour une commande introuvable", async () => {
    expect(await ring(null)).toEqual([]);
  });

  it("une cloche en panne ne fait pas échouer l'abonné", async () => {
    const work = new CapturingWork();
    new RingRefundDue(
      new OneSubject(PUBLIC),
      new BrokenNotifier(),
      new FixedClock(NOW),
      work,
    ).handle(new OrderPaidAfterCancellationEvent("order_5"));

    await expect(Promise.all(work.tasks)).resolves.toBeDefined();
  });
});

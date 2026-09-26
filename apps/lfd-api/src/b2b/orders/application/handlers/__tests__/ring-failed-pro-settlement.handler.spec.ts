import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  OrderPaymentFailedEvent,
  type PaymentFailureCause,
} from "../../../domain/events/order-payment-failed.event.js";
import {
  FailedSettlementReader,
  type FailedSettlementSubject,
} from "../../../domain/ports/failed-settlement.reader.js";
import { RingFailedProSettlement } from "../ring-failed-pro-settlement.handler.js";
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
const PRO: FailedSettlementSubject = {
  orderNumber: "ORD-9",
  clientele: "pro",
  companyName: "Hôtel des Trois Ponts",
};

function handlerWith(subject: FailedSettlementSubject | null, notifier: StaffNotifier) {
  return new RingFailedProSettlement(
    new OneSubject(subject),
    notifier,
    new FixedClock(NOW),
    new ImmediateWork(),
  );
}

/** Publie le fait, laisse l'abonné finir, et rend ce que la cloche a reçu. */
async function ring(
  subject: FailedSettlementSubject | null,
  cause: PaymentFailureCause,
): Promise<readonly StaffNotice[]> {
  const notifier = new RecordingNotifier();
  handlerWith(subject, notifier).handle(new OrderPaymentFailedEvent("order_9", cause));
  await new Promise((resolve) => setImmediate(resolve));
  return notifier.notices;
}

/** D4 : tout règlement pro qui meurt sonne, quelle que soit la cause (Q3, Q7). */
describe("RingFailedProSettlement", () => {
  it.each<PaymentFailureCause>(["refused", "abandoned", "day_closed"])(
    "sonne pour une commande pro — cause %s",
    async (cause) => {
      const notices = await ring(PRO, cause);

      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        kind: "order.payment_failed",
        subject: "Règlement tombé — Hôtel des Trois Ponts",
        link: "/commandes/order_9",
        idempotencyKey: `notification:order.payment_failed:order_9:${cause}`,
        occurredAt: NOW,
      });
    },
  );

  it("dit la cause dans le corps", async () => {
    const notices = await ring(PRO, "day_closed");

    expect(notices[0]?.body).toContain("Commande ORD-9");
    expect(notices[0]?.body).toContain("annulée");
  });

  it("ne sonne pas pour un particulier, ni pour une clientèle inconnue", async () => {
    expect(await ring({ ...PRO, clientele: "public" }, "refused")).toEqual([]);
    expect(await ring({ ...PRO, clientele: null }, "refused")).toEqual([]);
  });

  it("nomme la commande quand elle n'a plus de société", async () => {
    const notices = await ring({ ...PRO, companyName: null }, "refused");

    expect(notices[0]?.subject).toBe("Règlement tombé — ORD-9");
  });

  it("une cloche en panne ne fait pas échouer l'abonné", async () => {
    const work = new CapturingWork();
    const handler = new RingFailedProSettlement(
      new OneSubject(PRO),
      new BrokenNotifier(),
      new FixedClock(NOW),
      work,
    );
    handler.handle(new OrderPaymentFailedEvent("order_9", "refused"));

    await expect(work.tasks[0]).resolves.toBeUndefined();
  });
});

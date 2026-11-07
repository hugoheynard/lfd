import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { MailBacklogReader } from "../../domain/ports/mail-backlog.reader.js";
import type { MailBacklog, MailBacklogCriteria } from "../../domain/services/mail-backlog.js";
import { WatchMailRequestsHandler } from "../watch-mail-requests.handler.js";

const NOW = new Date("2026-11-07T10:42:00.000Z");
const MINUTE_MS = 60_000;

/** Un relevé fixé, et les critères reçus. */
class FixedBacklog extends MailBacklogReader {
  readonly asked: MailBacklogCriteria[] = [];
  constructor(public value: MailBacklog) {
    super();
  }
  read(criteria: MailBacklogCriteria): Promise<MailBacklog> {
    this.asked.push(criteria);
    return Promise.resolve(this.value);
  }
}

/** La cloche, avec son anti-doublon par clé — comme la vraie. */
class RecordingBell extends StaffNotifier {
  readonly rung: StaffNotice[] = [];
  notify(notices: readonly StaffNotice[]): Promise<void> {
    for (const notice of notices) {
      if (!this.rung.some((one) => one.idempotencyKey === notice.idempotencyKey)) {
        this.rung.push(notice);
      }
    }
    return Promise.resolve();
  }
}

function setup(value: MailBacklog) {
  const reader = new FixedBacklog(value);
  const bell = new RecordingBell();
  const clock = new FixedClock(NOW);
  return { reader, bell, clock, handler: new WatchMailRequestsHandler(reader, bell, clock) };
}

const STALLED: MailBacklog = {
  stalled: 7,
  oldestStalledAt: new Date(NOW.getTime() - 42 * MINUTE_MS),
  definitiveFailures: 0,
};

describe("WatchMailRequestsHandler — la veille qui sonne la cloche (plan § 25)", () => {
  it("sonne une fois, avec le cas réel et le geste, adressée à la carte de santé", async () => {
    const { bell, handler } = setup(STALLED);

    const report = await handler.execute();

    expect(report).toEqual({
      stalled: 7,
      oldestStalledMinutes: 42,
      definitiveFailures: 0,
      alarms: ["stalled"],
    });
    expect(bell.rung).toHaveLength(1);
    expect(bell.rung[0]).toMatchObject({
      kind: "alert.mail",
      audience: "ops_health:read",
      idempotencyKey: "mail.backlog.stalled:2026-11-07T10",
      occurredAt: NOW,
    });
    expect(bell.rung[0]?.body).toContain("7 e-mails attendent depuis 42 min");
    expect(bell.rung[0]?.body).toContain("la boîte d'envoi ne part plus");
  });

  it("deux passages dans la même heure : une seule sonnerie ; l'heure suivante, une autre", async () => {
    const { bell, clock, handler } = setup(STALLED);

    await handler.execute();
    clock.advanceMs(5 * MINUTE_MS);
    await handler.execute();
    expect(bell.rung).toHaveLength(1);

    clock.advanceMs(15 * MINUTE_MS);
    await handler.execute();
    expect(bell.rung.map((notice) => notice.idempotencyKey)).toEqual([
      "mail.backlog.stalled:2026-11-07T10",
      "mail.backlog.stalled:2026-11-07T11",
    ]);
  });

  it("sous le seuil : ne sonne pas", async () => {
    const { bell, handler } = setup({
      stalled: 2,
      oldestStalledAt: new Date(NOW.getTime() - 5 * MINUTE_MS),
      definitiveFailures: 0,
    });

    expect((await handler.execute()).alarms).toEqual([]);
    expect(bell.rung).toEqual([]);
  });

  it("des échecs définitifs : sonne sur eux, au singulier comme au pluriel", async () => {
    const { bell, handler } = setup({ stalled: 0, oldestStalledAt: null, definitiveFailures: 2 });

    await handler.execute();

    expect(bell.rung.map((notice) => notice.idempotencyKey)).toEqual([
      "mail.backlog.failed:2026-11-07T10",
    ]);
    expect(bell.rung[0]?.body).toContain("2 e-mails ont échoué définitivement depuis hier");
  });

  it("demande la base avec les critères calculés au Clock", async () => {
    const { reader, handler } = setup(STALLED);

    await handler.execute();

    expect(reader.asked[0]?.stalledBefore).toEqual(new Date(NOW.getTime() - 15 * MINUTE_MS));
  });
});

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { MailProbeTemplates } from "../../../sends/domain/ports/mail-probe-templates.js";
import { MailBacklogReader } from "../../domain/ports/mail-backlog.reader.js";
import { MailDeliveryCountsReader } from "../../domain/ports/mail-delivery-counts.reader.js";
import type { MailBacklog, MailBacklogCriteria } from "../../domain/services/mail-backlog.js";
import type {
  MailDeliveryCounts,
  MailDeliveryCriteria,
  MailRejection,
} from "../../domain/services/mail-rejections.js";
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

/** Les rebonds fixés, et les critères reçus. */
class FixedRejections extends MailDeliveryCountsReader {
  readonly asked: MailDeliveryCriteria[] = [];
  value: readonly MailRejection[] = [];
  counts(): Promise<MailDeliveryCounts> {
    return Promise.resolve({
      awaitingReturn: 0,
      delayed: 0,
      delivered: 0,
      bounced: 0,
      complained: 0,
    });
  }
  rejections(criteria: MailDeliveryCriteria): Promise<readonly MailRejection[]> {
    this.asked.push(criteria);
    return Promise.resolve(this.value);
  }
}

/** La sonde de déploiement, seul modèle hors de l'éditeur. */
class ProbeTemplates extends MailProbeTemplates {
  keys(): readonly string[] {
    return ["ops.deploy-check"];
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
  const rejections = new FixedRejections();
  const handler = new WatchMailRequestsHandler(
    reader,
    rejections,
    new ProbeTemplates(),
    bell,
    clock,
  );
  return { reader, rejections, bell, clock, handler };
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
      rejectedTemplates: [],
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

  /** Hugo, 2026-11-08 : l'échec se lit au suivi, pas à la carte de santé. */
  it("des échecs définitifs mènent au suivi, adressés à son droit ; la file bloquée reste à la carte", async () => {
    const failed = setup({ stalled: 0, oldestStalledAt: null, definitiveFailures: 1 });
    await failed.handler.execute();
    expect(failed.bell.rung[0]).toMatchObject({
      link: "/emails/envois",
      audience: "mail_sends:read",
    });

    const stalled = setup({
      stalled: 7,
      oldestStalledAt: new Date(NOW.getTime() - 42 * 60_000),
      definitiveFailures: 0,
    });
    await stalled.handler.execute();
    expect(stalled.bell.rung[0]).toMatchObject({ link: "/sante", audience: "ops_health:read" });
  });

  it("demande la base avec les critères calculés au Clock", async () => {
    const { reader, handler } = setup(STALLED);

    await handler.execute();

    expect(reader.asked[0]?.stalledBefore).toEqual(new Date(NOW.getTime() - 15 * MINUTE_MS));
  });
});

const QUIET: MailBacklog = { stalled: 0, oldestStalledAt: null, definitiveFailures: 0 };
const HOUR_MS = 60 * MINUTE_MS;

function rejection(template: string, count: number, minutesAgo: number): MailRejection {
  return { template, count, lastAt: new Date(NOW.getTime() - minutesAgo * MINUTE_MS) };
}

describe("WatchMailRequestsHandler — les rebonds et plaintes (T1b)", () => {
  it("une cloche par modèle, menant au suivi, adressée à son droit", async () => {
    const { rejections, bell, handler } = setup(QUIET);
    rejections.value = [
      rejection("customer.access-opened", 3, 20),
      rejection("customer.order-ready", 1, 90),
    ];

    const report = await handler.execute();

    expect(report.rejectedTemplates).toEqual(["customer.access-opened", "customer.order-ready"]);
    expect(report.alarms).toEqual([]);
    expect(bell.rung).toHaveLength(2);
    expect(bell.rung[0]).toMatchObject({
      kind: "alert.mail",
      link: "/emails/envois",
      audience: "mail_sends:read",
      subject: "Courrier non reçu",
    });
    expect(bell.rung[0]?.body).toContain("3 e-mails ont rebondi ou été signalés");
    expect(bell.rung[0]?.body).toContain("« customer.access-opened »");
    expect(bell.rung[1]?.body).toContain("1 e-mail a rebondi ou été signalé depuis hier");
  });

  it("ne resonne pas à chaque passage pour le même rebond, même des heures plus tard", async () => {
    const { rejections, bell, clock, handler } = setup(QUIET);
    rejections.value = [rejection("customer.access-opened", 1, 20)];

    await handler.execute();
    clock.advanceMs(5 * MINUTE_MS);
    await handler.execute();
    clock.advanceMs(3 * HOUR_MS);
    await handler.execute();

    expect(bell.rung).toHaveLength(1);
  });

  it("resonne quand un nouveau rebond arrive sur le même modèle", async () => {
    const { rejections, bell, clock, handler } = setup(QUIET);
    rejections.value = [rejection("customer.access-opened", 1, 20)];
    await handler.execute();

    clock.advanceMs(HOUR_MS);
    rejections.value = [rejection("customer.access-opened", 2, -40)];
    await handler.execute();

    expect(bell.rung).toHaveLength(2);
    expect(bell.rung[1]?.body).toContain("2 e-mails ont rebondi");
  });

  it("demande les rebonds d'hier, la sonde de déploiement exclue", async () => {
    const { rejections, handler } = setup(QUIET);

    await handler.execute();

    expect(rejections.asked).toEqual([
      { since: new Date(NOW.getTime() - 24 * HOUR_MS), exceptTemplates: ["ops.deploy-check"] },
    ]);
  });

  it("sans rebond ni file : ne sonne pas", async () => {
    const { bell, handler } = setup(QUIET);

    expect((await handler.execute()).rejectedTemplates).toEqual([]);
    expect(bell.rung).toEqual([]);
  });
});

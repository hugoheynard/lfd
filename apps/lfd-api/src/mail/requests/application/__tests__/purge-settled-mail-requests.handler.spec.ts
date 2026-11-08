import type { PurgeCensus, PurgeMode } from "../../../../platform/retention/purge-mode.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { OrphanMailDeliveryPruner } from "../../../deliveries/domain/ports/orphan-mail-delivery.pruner.js";
import { MailConsultationPruner } from "../../../sends/domain/ports/mail-consultation.pruner.js";
import { MailRequestPruner } from "../../domain/ports/mail-request.pruner.js";
import {
  isMailRequestPurgeable,
  type MailRequestRetentionFacts,
} from "../../domain/services/mail-request-retention.js";
import {
  MAIL_REQUEST_PURGE_BATCH_SIZE,
  PurgeSettledMailRequestsHandler,
} from "../purge-settled-mail-requests.handler.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const clock = new FixedClock(new Date());
const daysAgo = (days: number): Date => new Date(clock.now().getTime() - days * MS_PER_DAY);

/** Des demandes en mémoire, jugées par la règle même que le SQL transcrit. */
class InMemoryMailRequestPruner extends MailRequestPruner {
  readonly limits: number[] = [];
  constructor(public rows: MailRequestRetentionFacts[]) {
    super();
  }
  census(at: Date): Promise<PurgeCensus> {
    const count = this.rows.filter((row) => isMailRequestPurgeable(row, at)).length;
    return Promise.resolve({ count, oldest: null });
  }
  pruneBatch(at: Date, limit: number): Promise<number> {
    this.limits.push(limit);
    const doomed = this.rows.filter((row) => isMailRequestPurgeable(row, at)).slice(0, limit);
    this.rows = this.rows.filter((row) => !doomed.includes(row));
    return Promise.resolve(doomed.length);
  }
}

/** Les retours orphelins, par instant de réception ; la règle « sans demande » est du SQL (e2e). */
class InMemoryOrphanPruner extends OrphanMailDeliveryPruner {
  readonly cutoffs: Date[] = [];
  constructor(public receivedAt: Date[]) {
    super();
  }
  census(at: Date): Promise<PurgeCensus> {
    this.cutoffs.push(at);
    return Promise.resolve({
      count: this.receivedAt.filter((one) => one < at).length,
      oldest: null,
    });
  }
  pruneBatch(at: Date, limit: number): Promise<number> {
    const doomed = this.receivedAt.filter((one) => one < at).slice(0, limit);
    this.receivedAt = this.receivedAt.filter((one) => !doomed.includes(one));
    return Promise.resolve(doomed.length);
  }
}

/** Les consultations du suivi (T2), par instant. */
class InMemoryConsultationPruner extends MailConsultationPruner {
  readonly cutoffs: Date[] = [];
  constructor(public at: Date[]) {
    super();
  }
  census(cutoff: Date): Promise<PurgeCensus> {
    this.cutoffs.push(cutoff);
    return Promise.resolve({ count: this.at.filter((one) => one < cutoff).length, oldest: null });
  }
  pruneBatch(cutoff: Date, limit: number): Promise<number> {
    const doomed = this.at.filter((one) => one < cutoff).slice(0, limit);
    this.at = this.at.filter((one) => !doomed.includes(one));
    return Promise.resolve(doomed.length);
  }
}

const OLD_SENT: MailRequestRetentionFacts = {
  status: "sent",
  sentAt: daysAgo(400),
  failedAt: null,
};
const OLD_REQUESTED: MailRequestRetentionFacts = {
  status: "requested",
  sentAt: null,
  failedAt: null,
};
const RECENT_FAILED: MailRequestRetentionFacts = {
  status: "failed",
  sentAt: null,
  failedAt: daysAgo(3),
};

function handler(
  pruner: MailRequestPruner,
  mode: PurgeMode,
  orphans: OrphanMailDeliveryPruner = new InMemoryOrphanPruner([]),
  consultations: MailConsultationPruner = new InMemoryConsultationPruner([]),
): PurgeSettledMailRequestsHandler {
  return new PurgeSettledMailRequestsHandler(pruner, orphans, consultations, clock, mode);
}

describe("PurgeSettledMailRequestsHandler", () => {
  it("dry-run (défaut) : compte la demande close ancienne, ne supprime rien", async () => {
    const pruner = new InMemoryMailRequestPruner([OLD_SENT, OLD_REQUESTED, RECENT_FAILED]);

    await expect(handler(pruner, "dry-run").execute()).resolves.toMatchObject({
      mode: "dry-run",
      eligible: 1,
      purged: 0,
    });
    expect(pruner.rows).toHaveLength(3);
    expect(pruner.limits).toEqual([]);
  });

  it("off : ne fait rien", async () => {
    const pruner = new InMemoryMailRequestPruner([OLD_SENT]);

    await expect(handler(pruner, "off").execute()).resolves.toMatchObject({
      eligible: null,
      purged: 0,
    });
    expect(pruner.rows).toEqual([OLD_SENT]);
  });

  it("on : supprime la close ancienne, jamais la demande en attente", async () => {
    const pruner = new InMemoryMailRequestPruner([OLD_SENT, OLD_REQUESTED, RECENT_FAILED]);

    await expect(handler(pruner, "on").execute()).resolves.toMatchObject({ purged: 1 });
    expect(pruner.rows).toEqual([OLD_REQUESTED, RECENT_FAILED]);
  });

  it("on : par lots bornés", async () => {
    const total = MAIL_REQUEST_PURGE_BATCH_SIZE + 1;
    const pruner = new InMemoryMailRequestPruner(
      Array.from({ length: total }, () => ({ ...OLD_SENT })),
    );

    await expect(handler(pruner, "on").execute()).resolves.toMatchObject({ purged: total });
    expect(pruner.limits).toEqual([MAIL_REQUEST_PURGE_BATCH_SIZE, MAIL_REQUEST_PURGE_BATCH_SIZE]);
  });

  describe("les retours orphelins (suivi des e-mails, T1)", () => {
    it("dry-run : compte ceux de plus de 30 jours, sans rien supprimer", async () => {
      const orphans = new InMemoryOrphanPruner([daysAgo(31), daysAgo(29)]);

      const report = await handler(new InMemoryMailRequestPruner([]), "dry-run", orphans).execute();

      expect(report.orphanDeliveries).toMatchObject({ mode: "dry-run", eligible: 1, purged: 0 });
      expect(orphans.receivedAt).toHaveLength(2);
      expect(orphans.cutoffs).toEqual([daysAgo(30)]);
    });

    it("on : supprime ceux de plus de 30 jours, sous le même cran que les demandes", async () => {
      const orphans = new InMemoryOrphanPruner([daysAgo(31), daysAgo(29)]);

      const report = await handler(new InMemoryMailRequestPruner([]), "on", orphans).execute();

      expect(report.orphanDeliveries).toMatchObject({ mode: "on", purged: 1 });
      expect(orphans.receivedAt).toEqual([daysAgo(29)]);
    });

    it("off : n'y touche pas", async () => {
      const orphans = new InMemoryOrphanPruner([daysAgo(40)]);

      const report = await handler(new InMemoryMailRequestPruner([]), "off", orphans).execute();

      expect(report.orphanDeliveries).toMatchObject({ eligible: null, purged: 0 });
      expect(orphans.cutoffs).toEqual([]);
    });
  });

  describe("les consultations du suivi (révélations et recherches, T2)", () => {
    it("dry-run : compte celles de plus d'un an, sans rien supprimer", async () => {
      const consultations = new InMemoryConsultationPruner([daysAgo(366), daysAgo(364)]);

      const report = await handler(
        new InMemoryMailRequestPruner([]),
        "dry-run",
        undefined,
        consultations,
      ).execute();

      expect(report.consultations).toMatchObject({ mode: "dry-run", eligible: 1, purged: 0 });
      expect(consultations.at).toHaveLength(2);
      expect(consultations.cutoffs).toEqual([daysAgo(365)]);
    });

    it("on : supprime celles de plus d'un an, sous le même cran", async () => {
      const consultations = new InMemoryConsultationPruner([daysAgo(366), daysAgo(364)]);

      const report = await handler(
        new InMemoryMailRequestPruner([]),
        "on",
        undefined,
        consultations,
      ).execute();

      expect(report.consultations).toMatchObject({ mode: "on", purged: 1 });
      expect(consultations.at).toEqual([daysAgo(364)]);
    });
  });
});

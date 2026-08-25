import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { Lead } from "../../../domain/entities/lead.js";
import { LeadNotFoundError, LeadTransitionError } from "../../../domain/errors/lead-errors.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { LeadRepository } from "../../../domain/ports/lead.repository.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ChangeLeadStatusCommand } from "../change-lead-status.command.js";
import { ChangeLeadStatusHandler } from "../change-lead-status.handler.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

function newLead(): Lead {
  return Lead.reconstitute({
    id: "lead_1",
    businessName: "Bistrot",
    contactName: "",
    email: "",
    phone: "",
    siret: "",
    notes: "",
    status: "new",
    linkedUserId: null,
    lastContactedAt: null,
  });
}

class FakeRepo extends LeadRepository {
  saved: Lead | null = null;
  constructor(private readonly stored: Lead | null) {
    super();
  }
  create(): Promise<string> {
    return Promise.resolve("lead_1");
  }
  load(): Promise<Lead | null> {
    return Promise.resolve(this.stored);
  }
  save(lead: Lead): Promise<void> {
    this.saved = lead;
    return Promise.resolve();
  }
  findOpenByEmail(): Promise<Lead | null> {
    return Promise.resolve(null);
  }
}

class CapturingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
  /** Les deux garanties écrivent au même endroit — le double n'en distingue qu'une. */
  recordOrFail(input: RecordActivityInput): Promise<void> {
    return this.record(input);
  }
}

function handlerFor(lead: Lead | null): {
  handler: ChangeLeadStatusHandler;
  recorder: CapturingRecorder;
  repo: FakeRepo;
} {
  const repo = new FakeRepo(lead);
  const recorder = new CapturingRecorder();
  return {
    handler: new ChangeLeadStatusHandler(repo, recorder, new FixedClock(NOW)),
    recorder,
    repo,
  };
}

describe("ChangeLeadStatusHandler", () => {
  it("avance le lead, sauvegarde et journalise lead.stage_changed", async () => {
    const { handler, recorder, repo } = handlerFor(newLead());
    await handler.execute(new ChangeLeadStatusCommand("lead_1", "contacted"));
    expect(repo.saved?.status).toBe("contacted");
    expect(recorder.records[0]).toMatchObject({
      type: "lead.stage_changed",
      subjectId: "lead_1",
      idempotencyKey: "lead.stage_changed:lead_1:contacted",
      payload: { status: "contacted" },
    });
  });

  it("journalise lead.converted lors d'une conversion manuelle", async () => {
    const { handler, recorder } = handlerFor(newLead());
    await handler.execute(new ChangeLeadStatusCommand("lead_1", "converted"));
    expect(recorder.records[0]).toMatchObject({
      type: "lead.converted",
      payload: { via: "manual" },
    });
  });

  it("journalise lead.lost lors d'une perte", async () => {
    const { handler, recorder } = handlerFor(newLead());
    await handler.execute(new ChangeLeadStatusCommand("lead_1", "lost"));
    expect(recorder.records[0]?.type).toBe("lead.lost");
  });

  it("404 quand le lead n'existe pas", async () => {
    const { handler } = handlerFor(null);
    await expect(handler.execute(new ChangeLeadStatusCommand("nope", "contacted"))).rejects.toThrow(
      LeadNotFoundError,
    );
  });

  it("laisse remonter le refus du domaine (recul interdit) et ne journalise pas", async () => {
    const lead = newLead();
    lead.moveTo("negotiating", NOW);
    const { handler, recorder } = handlerFor(lead);
    await expect(
      handler.execute(new ChangeLeadStatusCommand("lead_1", "contacted")),
    ).rejects.toThrow(LeadTransitionError);
    expect(recorder.records).toHaveLength(0);
  });
});

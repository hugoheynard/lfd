import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { Lead } from "../../../domain/entities/lead.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { LeadRepository } from "../../../domain/ports/lead.repository.js";
import { CaptureLeadCommand } from "../capture-lead.command.js";
import { CaptureLeadHandler } from "../capture-lead.handler.js";

/** Repo doublé par EXTENSION : capture le lead créé, rend un id fixe. */
class FakeRepo extends LeadRepository {
  created: Lead | null = null;
  create(lead: Lead): Promise<string> {
    this.created = lead;
    return Promise.resolve("lead_001");
  }
  load(): Promise<Lead | null> {
    return Promise.resolve(null);
  }
  save(): Promise<void> {
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

describe("CaptureLeadHandler", () => {
  it("persiste le lead saisi puis journalise lead.captured, et rend l'id", async () => {
    const repo = new FakeRepo();
    const recorder = new CapturingRecorder();
    const handler = new CaptureLeadHandler(repo, recorder);

    const id = await handler.execute(
      new CaptureLeadCommand({
        businessName: "Bistrot du Coin",
        contactName: "",
        email: "hello@bistrot.fr",
        phone: "",
        siret: "",
        notes: "",
      }),
    );

    expect(id).toBe("lead_001");
    expect(repo.created?.businessName).toBe("Bistrot du Coin");
    expect(repo.created?.status).toBe("new");
    expect(recorder.records[0]).toMatchObject({
      type: "lead.captured",
      subjectType: "lead",
      subjectId: "lead_001",
      idempotencyKey: "lead.captured:lead_001",
    });
  });
});

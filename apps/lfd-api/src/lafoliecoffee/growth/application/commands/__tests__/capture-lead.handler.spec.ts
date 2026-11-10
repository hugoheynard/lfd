import { Lead } from "../../../domain/entities/lead.js";
import { LeadRepository } from "../../../domain/ports/lead.repository.js";
import { CaptureLeadCommand } from "../capture-lead.command.js";
import { CaptureLeadHandler } from "../capture-lead.handler.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";

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

describe("CaptureLeadHandler", () => {
  it("persiste le lead saisi puis journalise lead.captured, et rend l'id", async () => {
    const repo = new FakeRepo();
    const recorder = new RecordingActivityRecorder();
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

  /**
   * Régression : `lead.captured` portait l'e-mail du prospect en clair, contre
   * la règle « jamais de coordonnées au journal » (relevé au lot A du plan des
   * phrases, retiré au lot B, 2026-09-19). Le lead le garde sur sa ligne.
   */
  it("nomme le prospect par son enseigne, et ne verse pas son e-mail au journal", async () => {
    const recorder = new RecordingActivityRecorder();
    await new CaptureLeadHandler(new FakeRepo(), recorder).execute(
      new CaptureLeadCommand({
        businessName: "Bistrot du Coin",
        contactName: "Marie",
        email: "hello@bistrot.fr",
        phone: "06 12 34 56 78",
        siret: "",
        notes: "",
      }),
    );

    expect(recorder.records[0]?.payload).toEqual({
      subjectLabel: "Bistrot du Coin",
      businessName: "Bistrot du Coin",
    });
    expect(JSON.stringify(recorder.records[0])).not.toContain("hello@bistrot.fr");
  });
});

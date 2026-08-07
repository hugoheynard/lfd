import { UserRegisteredEvent } from "../../../../account/domain/events/user-registered.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { Lead } from "../../../domain/entities/lead.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { LeadRepository } from "../../../domain/ports/lead.repository.js";
import { OnUserRegisteredLinkLead } from "../on-user-registered-link-lead.handler.js";

function openLead(email: string): Lead {
  return Lead.reconstitute({
    id: "lead_1",
    businessName: "Bistrot",
    contactName: "",
    email,
    phone: "",
    siret: "",
    notes: "",
    status: "contacted",
    linkedUserId: null,
    lastContactedAt: null,
  });
}

class FakeRepo extends LeadRepository {
  saved: Lead | null = null;
  constructor(private readonly match: Lead | null) {
    super();
  }
  create(): Promise<string> {
    return Promise.resolve("lead_1");
  }
  load(): Promise<Lead | null> {
    return Promise.resolve(null);
  }
  save(lead: Lead): Promise<void> {
    this.saved = lead;
    return Promise.resolve();
  }
  findOpenByEmail(): Promise<Lead | null> {
    return Promise.resolve(this.match);
  }
}

class CapturingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

describe("OnUserRegisteredLinkLead", () => {
  it("rattache et convertit le lead ouvert au même e-mail, et journalise via=registration", async () => {
    const repo = new FakeRepo(openLead("marie@bistrot.fr"));
    const recorder = new CapturingRecorder();
    const handler = new OnUserRegisteredLinkLead(repo, recorder);

    await handler.handle(new UserRegisteredEvent("user_42", "marie@bistrot.fr"));

    expect(repo.saved?.status).toBe("converted");
    expect(repo.saved?.linkedUserId).toBe("user_42");
    expect(recorder.records[0]).toMatchObject({
      type: "lead.converted",
      subjectId: "lead_1",
      payload: { via: "registration", linkedUserId: "user_42" },
    });
  });

  it("ne fait rien quand aucun lead ne correspond", async () => {
    const repo = new FakeRepo(null);
    const recorder = new CapturingRecorder();
    const handler = new OnUserRegisteredLinkLead(repo, recorder);

    await handler.handle(new UserRegisteredEvent("user_42", "inconnu@resto.fr"));

    expect(repo.saved).toBeNull();
    expect(recorder.records).toHaveLength(0);
  });

  it("ignore une inscription sans e-mail (pas de clé de rapprochement)", async () => {
    const repo = new FakeRepo(openLead("marie@bistrot.fr"));
    const recorder = new CapturingRecorder();
    const handler = new OnUserRegisteredLinkLead(repo, recorder);

    await handler.handle(new UserRegisteredEvent("user_42", ""));

    expect(repo.saved).toBeNull();
    expect(recorder.records).toHaveLength(0);
  });
});

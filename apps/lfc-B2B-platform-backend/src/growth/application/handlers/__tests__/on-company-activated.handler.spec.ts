import { CompanyActivatedEvent } from "../../../../account/domain/events/company-activated.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { OnCompanyActivated } from "../on-company-activated.handler.js";

/** Recorder doublé : capture les entrées (extension du port, sans cast). */
class RecordingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

describe("OnCompanyActivated", () => {
  it("journalise company.activated avec occurredAt = l'instant d'activation métier", async () => {
    const activatedAt = new Date("2026-08-07T09:30:00.000Z");
    const recorder = new RecordingRecorder();

    await new OnCompanyActivated(recorder).handle(
      new CompanyActivatedEvent("company_3", activatedAt),
    );

    expect(recorder.records[0]).toEqual({
      type: "company.activated",
      subjectType: "company",
      subjectId: "company_3",
      occurredAt: activatedAt,
      idempotencyKey: "company.activated:company_3",
      payload: { activatedAt: "2026-08-07T09:30:00.000Z" },
    });
  });
});

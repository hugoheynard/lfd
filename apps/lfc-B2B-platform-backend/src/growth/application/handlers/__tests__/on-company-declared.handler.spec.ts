import { CompanyDeclaredEvent } from "../../../../account/domain/events/company-declared.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { OnCompanyDeclared } from "../on-company-declared.handler.js";

/** Recorder doublé : capture les entrées (extension du port, sans cast). */
class RecordingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

describe("OnCompanyDeclared", () => {
  it("journalise company.declared sur la société, canal `self`, clé déterministe", async () => {
    const recorder = new RecordingRecorder();
    await new OnCompanyDeclared(recorder).handle(
      new CompanyDeclaredEvent("company_5", "self", "user_2"),
    );

    expect(recorder.records[0]).toEqual({
      type: "company.declared",
      subjectType: "company",
      subjectId: "company_5",
      idempotencyKey: "company.declared:company_5",
      payload: { via: "self", ownerUserId: "user_2" },
    });
  });

  it("porte le canal `staff` et un propriétaire nul", async () => {
    const recorder = new RecordingRecorder();
    await new OnCompanyDeclared(recorder).handle(
      new CompanyDeclaredEvent("company_9", "staff", null),
    );
    expect(recorder.records[0]?.payload).toEqual({ via: "staff", ownerUserId: null });
  });
});

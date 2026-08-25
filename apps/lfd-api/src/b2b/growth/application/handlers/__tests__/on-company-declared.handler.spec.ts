import { CompanyDeclaredEvent } from "../../../../account/domain/events/company-declared.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { OnCompanyDeclared } from "../on-company-declared.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";

/** Recorder doublé : capture les entrées (extension du port, sans cast). */
class RecordingRecorder extends ActivityRecorder {
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

describe("OnCompanyDeclared", () => {
  const work = new BackgroundWork();

  it("journalise company.declared sur la société, canal `self`, clé déterministe", async () => {
    const recorder = new RecordingRecorder();
    new OnCompanyDeclared(recorder, work).handle(
      new CompanyDeclaredEvent("company_5", "self", "user_2"),
    );
    await work.whenIdle();

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
    new OnCompanyDeclared(recorder, work).handle(
      new CompanyDeclaredEvent("company_9", "staff", null),
    );
    await work.whenIdle();
    expect(recorder.records[0]?.payload).toEqual({ via: "staff", ownerUserId: null });
  });
});

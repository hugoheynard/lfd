import { CompanyDeclaredEvent } from "../../../../account/domain/events/company-declared.event.js";
import { OnCompanyDeclared } from "../on-company-declared.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";

describe("OnCompanyDeclared", () => {
  const work = new BackgroundWork();

  it("journalise company.declared sur la société, canal `self`, clé déterministe", async () => {
    const recorder = new RecordingActivityRecorder();
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
    const recorder = new RecordingActivityRecorder();
    new OnCompanyDeclared(recorder, work).handle(
      new CompanyDeclaredEvent("company_9", "staff", null),
    );
    await work.whenIdle();
    expect(recorder.records[0]?.payload).toEqual({ via: "staff", ownerUserId: null });
  });
});

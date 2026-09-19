import { CompanyStepReachedEvent } from "../../../../account/domain/events/company-step-reached.event.js";
import { OnCompanyStepReached } from "../on-company-step-reached.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";

describe("OnCompanyStepReached", () => {
  const work = new BackgroundWork();

  it("journalise company.step_reached avec une clé PAR (société, étape)", async () => {
    const recorder = new RecordingActivityRecorder();
    new OnCompanyStepReached(recorder, work).handle(
      new CompanyStepReachedEvent("company_2", "Le Pain Quotidien", "kbis"),
    );
    await work.whenIdle();

    expect(recorder.records[0]).toEqual({
      type: "company.step_reached",
      subjectType: "company",
      subjectId: "company_2",
      idempotencyKey: "company.step_reached:kbis:company_2",
      payload: { subjectLabel: "Le Pain Quotidien", step: "kbis" },
    });
  });

  it("distingue deux étapes de la même société par la clé", async () => {
    const recorder = new RecordingActivityRecorder();
    const handler = new OnCompanyStepReached(recorder, work);
    handler.handle(new CompanyStepReachedEvent("company_2", "Le Pain Quotidien", "vat"));
    handler.handle(new CompanyStepReachedEvent("company_2", "Le Pain Quotidien", "billing"));
    await work.whenIdle();

    expect(recorder.records.map((r) => r.idempotencyKey)).toEqual([
      "company.step_reached:vat:company_2",
      "company.step_reached:billing:company_2",
    ]);
  });
});

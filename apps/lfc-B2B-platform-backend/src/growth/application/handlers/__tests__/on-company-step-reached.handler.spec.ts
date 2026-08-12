import { CompanyStepReachedEvent } from "../../../../account/domain/events/company-step-reached.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { OnCompanyStepReached } from "../on-company-step-reached.handler.js";
import { BackgroundWork } from "../../../../infra/events/background-work.js";

/** Recorder doublé : capture les entrées (extension du port, sans cast). */
class RecordingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

describe("OnCompanyStepReached", () => {
  const work = new BackgroundWork();

  it("journalise company.step_reached avec une clé PAR (société, étape)", async () => {
    const recorder = new RecordingRecorder();
    new OnCompanyStepReached(recorder, work).handle(
      new CompanyStepReachedEvent("company_2", "kbis"),
    );
    await work.whenIdle();

    expect(recorder.records[0]).toEqual({
      type: "company.step_reached",
      subjectType: "company",
      subjectId: "company_2",
      idempotencyKey: "company.step_reached:kbis:company_2",
      payload: { step: "kbis" },
    });
  });

  it("distingue deux étapes de la même société par la clé", async () => {
    const recorder = new RecordingRecorder();
    const handler = new OnCompanyStepReached(recorder, work);
    await handler.handle(new CompanyStepReachedEvent("company_2", "tva"));
    await handler.handle(new CompanyStepReachedEvent("company_2", "billing"));

    expect(recorder.records.map((r) => r.idempotencyKey)).toEqual([
      "company.step_reached:tva:company_2",
      "company.step_reached:billing:company_2",
    ]);
  });
});

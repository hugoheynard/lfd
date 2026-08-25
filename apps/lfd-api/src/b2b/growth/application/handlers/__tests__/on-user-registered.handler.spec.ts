import { UserRegisteredEvent } from "../../../../account/domain/events/user-registered.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { OnUserRegistered } from "../on-user-registered.handler.js";
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

describe("OnUserRegistered", () => {
  const work = new BackgroundWork();

  it("journalise user.registered sur la personne, clé déterministe, e-mail en payload", async () => {
    const recorder = new RecordingRecorder();
    new OnUserRegistered(recorder, work).handle(new UserRegisteredEvent("user_8", "chef@resto.fr"));
    await work.whenIdle();

    expect(recorder.records[0]).toEqual({
      type: "user.registered",
      subjectType: "user",
      subjectId: "user_8",
      idempotencyKey: "user.registered:user_8",
      payload: { email: "chef@resto.fr" },
    });
  });
});

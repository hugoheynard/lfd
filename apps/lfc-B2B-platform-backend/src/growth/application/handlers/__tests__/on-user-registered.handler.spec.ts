import { UserRegisteredEvent } from "../../../../account/domain/events/user-registered.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { OnUserRegistered } from "../on-user-registered.handler.js";

/** Recorder doublé : capture les entrées (extension du port, sans cast). */
class RecordingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

describe("OnUserRegistered", () => {
  it("journalise user.registered sur la personne, clé déterministe, e-mail en payload", async () => {
    const recorder = new RecordingRecorder();
    await new OnUserRegistered(recorder).handle(new UserRegisteredEvent("user_8", "chef@resto.fr"));

    expect(recorder.records[0]).toEqual({
      type: "user.registered",
      subjectType: "user",
      subjectId: "user_8",
      idempotencyKey: "user.registered:user_8",
      payload: { email: "chef@resto.fr" },
    });
  });
});

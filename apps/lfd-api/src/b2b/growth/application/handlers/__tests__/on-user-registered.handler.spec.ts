import { UserRegisteredEvent } from "../../../../account/domain/events/user-registered.event.js";
import { OnUserRegistered } from "../on-user-registered.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";

describe("OnUserRegistered", () => {
  const work = new BackgroundWork();

  it("journalise user.registered sur la personne, clé déterministe, e-mail en payload", async () => {
    const recorder = new RecordingActivityRecorder();
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

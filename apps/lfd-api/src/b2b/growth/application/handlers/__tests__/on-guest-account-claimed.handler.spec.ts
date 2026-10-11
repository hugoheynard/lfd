import { GuestAccountClaimedEvent } from "../../../../account/domain/events/guest-account-claimed.event.js";
import { OnGuestAccountClaimed } from "../on-guest-account-claimed.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";

describe("OnGuestAccountClaimed", () => {
  it("compte le rattachement comme une inscription : user.registered, même clé", async () => {
    const work = new BackgroundWork();
    const recorder = new RecordingActivityRecorder();

    new OnGuestAccountClaimed(recorder, work).handle(new GuestAccountClaimedEvent("user_8"));
    await work.whenIdle();

    expect(recorder.records).toEqual([
      {
        type: "user.registered",
        subjectType: "user",
        subjectId: "user_8",
        idempotencyKey: "user.registered:user_8",
        payload: {},
      },
    ]);
  });
});

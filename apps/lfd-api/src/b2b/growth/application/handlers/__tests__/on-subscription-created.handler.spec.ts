import { SubscriptionCreatedEvent } from "../../../../subscriptions/domain/events/subscription-created.event.js";
import { OnSubscriptionCreated } from "../on-subscription-created.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";

describe("OnSubscriptionCreated", () => {
  const work = new BackgroundWork();

  it("journalise subscription.created sur la personne, clé par abonnement", async () => {
    const recorder = new RecordingActivityRecorder();
    new OnSubscriptionCreated(recorder, work).handle(
      new SubscriptionCreatedEvent("sub_7", "user_4", "weekly"),
    );
    await work.whenIdle();

    expect(recorder.records[0]).toEqual({
      type: "subscription.created",
      subjectType: "user",
      subjectId: "user_4",
      idempotencyKey: "subscription.created:sub_7",
      payload: { subscriptionId: "sub_7", recurrence: "weekly" },
    });
  });
});

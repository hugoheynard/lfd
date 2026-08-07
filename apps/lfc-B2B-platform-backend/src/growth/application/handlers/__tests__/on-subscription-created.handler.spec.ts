import { SubscriptionCreatedEvent } from "../../../../subscriptions/domain/events/subscription-created.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { OnSubscriptionCreated } from "../on-subscription-created.handler.js";

/** Recorder doublé : capture les entrées (extension du port, sans cast). */
class RecordingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

describe("OnSubscriptionCreated", () => {
  it("journalise subscription.created sur la personne, clé par abonnement", async () => {
    const recorder = new RecordingRecorder();
    await new OnSubscriptionCreated(recorder).handle(
      new SubscriptionCreatedEvent("sub_7", "user_4", "weekly"),
    );

    expect(recorder.records[0]).toEqual({
      type: "subscription.created",
      subjectType: "user",
      subjectId: "user_4",
      idempotencyKey: "subscription.created:sub_7",
      payload: { subscriptionId: "sub_7", recurrence: "weekly" },
    });
  });
});

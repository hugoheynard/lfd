import { SubscriptionCreatedEvent } from "../../../../subscriptions/domain/events/subscription-created.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { OnSubscriptionCreated } from "../on-subscription-created.handler.js";
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

describe("OnSubscriptionCreated", () => {
  const work = new BackgroundWork();

  it("journalise subscription.created sur la personne, clé par abonnement", async () => {
    const recorder = new RecordingRecorder();
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

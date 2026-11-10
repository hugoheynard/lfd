import { SubscriptionCreatedEvent } from "../../../../subscriptions/domain/events/subscription-created.event.js";
import { OnSubscriptionCreated } from "../on-subscription-created.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { CustomerNamer } from "../../../domain/ports/customer-namer.js";

/** L'annuaire des clients : un nom par fiche connue, `null` sinon — ou en panne. */
class Customers extends CustomerNamer {
  constructor(
    private readonly names: Readonly<Record<string, string>>,
    private readonly broken = false,
  ) {
    super();
  }

  nameOf(userId: string): Promise<string | null> {
    if (this.broken) {
      return Promise.reject(new Error("annuaire client indisponible"));
    }
    return Promise.resolve(this.names[userId] ?? null);
  }
}

describe("OnSubscriptionCreated", () => {
  const work = new BackgroundWork();

  it("journalise subscription.created sur la personne, nommée, clé par abonnement", async () => {
    const recorder = new RecordingActivityRecorder();
    new OnSubscriptionCreated(recorder, work, new Customers({ user_4: "Camille Rousseau" })).handle(
      new SubscriptionCreatedEvent("sub_7", "user_4", "weekly"),
    );
    await work.whenIdle();

    expect(recorder.records[0]).toEqual({
      type: "subscription.created",
      subjectType: "user",
      subjectId: "user_4",
      idempotencyKey: "subscription.created:sub_7",
      payload: { subjectLabel: "Camille Rousseau", subscriptionId: "sub_7", recurrence: "weekly" },
    });
  });

  it("une fiche sans nom, ou un annuaire en panne : le fait part sans libellé, jamais perdu", async () => {
    const recorder = new RecordingActivityRecorder();
    new OnSubscriptionCreated(recorder, work, new Customers({})).handle(
      new SubscriptionCreatedEvent("sub_8", "user_5", "weekly"),
    );
    new OnSubscriptionCreated(recorder, work, new Customers({}, true)).handle(
      new SubscriptionCreatedEvent("sub_9", "user_6", "monthly"),
    );
    await work.whenIdle();

    expect(recorder.records.map((record) => record.payload)).toEqual([
      { subscriptionId: "sub_8", recurrence: "weekly" },
      { subscriptionId: "sub_9", recurrence: "monthly" },
    ]);
  });
});

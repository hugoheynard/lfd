import {
  RECURRING_BASKET_OPENED,
  RecurringBasketFact,
  RecurringBasketFactPayloadError,
} from "../../../../../recurring/channels/commerce/index.js";
import { OnSubscriptionCreated } from "../on-subscription-created.handler.js";
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

/** Le fait d'ouverture tel que le bloc des paniers l'écrit. */
function opened(basketId: string, buyerUserId: string, cadence: string) {
  const fact = new RecurringBasketFact(
    RECURRING_BASKET_OPENED,
    basketId,
    buyerUserId,
    cadence,
    { companyId: "chalet", name: "Chalet Gentiane", principalCompanyId: null },
    null,
  );
  const { type, payload } = fact.durableFact();
  return { eventId: `evt_${basketId}`, type, payload };
}

describe("OnSubscriptionCreated", () => {
  it("journalise subscription.created sur la personne, nommée, clé par panier", async () => {
    const recorder = new RecordingActivityRecorder();
    await new OnSubscriptionCreated(recorder, new Customers({ user_4: "Camille Rousseau" })).handle(
      opened("sub_7", "user_4", "weekly"),
    );

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
    await new OnSubscriptionCreated(recorder, new Customers({})).handle(
      opened("sub_8", "user_5", "weekly"),
    );
    await new OnSubscriptionCreated(recorder, new Customers({}, true)).handle(
      opened("sub_9", "user_6", "monthly"),
    );

    expect(recorder.records.map((record) => record.payload)).toEqual([
      { subscriptionId: "sub_8", recurrence: "weekly" },
      { subscriptionId: "sub_9", recurrence: "monthly" },
    ]);
  });

  it("une charge hors forme lève, sans rien écrire", async () => {
    const recorder = new RecordingActivityRecorder();
    await expect(
      new OnSubscriptionCreated(recorder, new Customers({})).handle({
        eventId: "x",
        type: RECURRING_BASKET_OPENED,
        payload: {},
      }),
    ).rejects.toThrow(RecurringBasketFactPayloadError);
    expect(recorder.records).toEqual([]);
  });
});

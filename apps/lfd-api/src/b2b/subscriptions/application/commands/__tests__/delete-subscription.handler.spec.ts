import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { DeleteSubscriptionCommand } from "../delete-subscription.command.js";
import { DeleteSubscriptionHandler } from "../delete-subscription.handler.js";
import { activeSubscription, FakeSubscriptionRepository } from "./fake-subscription-repository.js";
import { SubscriptionNotFoundError } from "../../../domain/errors/subscription-errors.js";
import { subscriptionGestures } from "./subscription-gesture-doubles.js";
import { TablePickupPointNames } from "../../../../account/domain/ports/__tests__/table-pickup-point-names.js";
import { Subscription } from "../../../domain/entities/subscription.js";
import { IsoDate } from "../../../domain/value-objects/iso-date.js";
import { SubscriptionLine } from "../../../domain/value-objects/subscription-line.js";

function build() {
  const repo = new FakeSubscriptionRepository();
  const events = new RecordingPublisher();
  const handler = new DeleteSubscriptionHandler(
    repo,
    events,
    new DirectUnitOfWork(),
    subscriptionGestures(repo).gestures,
    new TablePickupPointNames(new Map([["pa_1", "Boutique Oberkampf"]])),
  );
  return { repo, events, handler };
}

describe("DeleteSubscriptionHandler", () => {
  it("404 quand l'abonnement n'est pas au mur — ni suppression, ni fait", async () => {
    const { repo, events, handler } = build();

    await expect(
      handler.execute(new DeleteSubscriptionCommand("user_1", "sub_1")),
    ).rejects.toBeInstanceOf(SubscriptionNotFoundError);
    expect(repo.removed).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("supprime l'abonnement au mur, et journalise ce qu'il décidait", async () => {
    const { repo, events, handler } = build();
    repo.loadResult = activeSubscription("sub_42");

    await handler.execute(new DeleteSubscriptionCommand("user_1", "sub_42"));

    expect(repo.removed).toEqual(["sub_42"]);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "subscription.deleted",
        subjectType: "subscription",
        subjectId: "sub_42",
        payload: {
          recurrence: "weekly",
          status: "active",
          startDate: "2026-08-10",
          endDate: "2026-12-10",
          fulfillmentMethod: "pickup",
          pickupAddress: null,
          lines: [{ sku: "SKU-1", quantity: 2 }],
        },
      },
    ]);
  });

  it("cite le point de retrait avec son nom du moment, ou son seul id s'il est inconnu", async () => {
    const pickupAt = (pickupAddressId: string, id: string): Subscription =>
      Subscription.reconstitute({
        id,
        placedByUserId: "user_1",
        companyId: null,
        fromOrderId: null,
        recurrence: "weekly",
        status: "active",
        startDate: IsoDate.fromString("2026-08-10"),
        endDate: null,
        routing: { method: "pickup", deliveryAddress: null, pickupAddressId },
        note: "",
        lines: [SubscriptionLine.create("SKU-1", 2)],
        overrides: [],
      });
    const { repo, events, handler } = build();

    repo.loadResult = pickupAt("pa_1", "sub_named");
    await handler.execute(new DeleteSubscriptionCommand("user_1", "sub_named"));
    repo.loadResult = pickupAt("pa_gone", "sub_bare");
    await handler.execute(new DeleteSubscriptionCommand("user_1", "sub_bare"));

    expect(events.traced.map((event) => event.journalFact().payload["pickupAddress"])).toEqual([
      { id: "pa_1", name: "Boutique Oberkampf" },
      "pa_gone",
    ]);
  });
});

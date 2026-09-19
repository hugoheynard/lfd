import { NotFoundException } from "@nestjs/common";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { DeleteSubscriptionCommand } from "../delete-subscription.command.js";
import { DeleteSubscriptionHandler } from "../delete-subscription.handler.js";
import { activeSubscription, FakeSubscriptionRepository } from "./fake-subscription-repository.js";

function build() {
  const repo = new FakeSubscriptionRepository();
  const events = new RecordingPublisher();
  const handler = new DeleteSubscriptionHandler(repo, events, new DirectUnitOfWork());
  return { repo, events, handler };
}

describe("DeleteSubscriptionHandler", () => {
  it("404 quand l'abonnement n'est pas au mur — ni suppression, ni fait", async () => {
    const { repo, events, handler } = build();

    await expect(
      handler.execute(new DeleteSubscriptionCommand("user_1", "sub_1")),
    ).rejects.toBeInstanceOf(NotFoundException);
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
          pickupAddressId: null,
          lines: [{ sku: "SKU-1", quantity: 2 }],
        },
      },
    ]);
  });
});

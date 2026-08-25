import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import type { CreateSubscriptionPayload } from "@lfd/contracts";

import { SubscriptionCreatedEvent } from "../../../domain/events/subscription-created.event.js";
import { CreateSubscriptionCommand } from "../create-subscription.command.js";
import { CreateSubscriptionHandler } from "../create-subscription.handler.js";
import { FakeSubscriptionRepository } from "./fake-subscription-repository.js";

/** Publisher doublé : capture les événements publiés (extension du port, sans cast). */
const payload: CreateSubscriptionPayload = {
  fromOrderId: null,
  recurrence: "weekly",
  startDate: "2026-08-10",
  endDate: null,
  fulfillmentMethod: "pickup",
  deliveryAddress: null,
  pickupAddressId: null,
  lines: [{ sku: "SKU-1", quantity: 2 }],
  note: "",
};

describe("CreateSubscriptionHandler", () => {
  it("construit un agrégat actif et le confie au port, puis renvoie l'id", async () => {
    const repo = new FakeSubscriptionRepository();
    const handler = new CreateSubscriptionHandler(repo, new RecordingPublisher());

    const result = await handler.execute(new CreateSubscriptionCommand("user_1", payload));

    expect(result).toEqual({ id: "sub_created" });
    expect(repo.created).toHaveLength(1);
    const state = repo.created[0]?.toPersistence();
    expect(state?.status).toBe("active");
    expect(state?.placedByUserId).toBe("user_1");
    expect(state?.lines).toEqual([{ sku: "SKU-1", quantity: 2 }]);
  });

  it("publie SubscriptionCreatedEvent (signal lead qualifié)", async () => {
    const events = new RecordingPublisher();
    const handler = new CreateSubscriptionHandler(new FakeSubscriptionRepository(), events);

    await handler.execute(new CreateSubscriptionCommand("user_1", payload));

    expect(events.published).toHaveLength(1);
    const [event] = events.published;
    expect(event).toBeInstanceOf(SubscriptionCreatedEvent);
    const created = event as SubscriptionCreatedEvent;
    expect(created.subscriptionId).toBe("sub_created");
    expect(created.placedByUserId).toBe("user_1");
    expect(created.recurrence).toBe("weekly");
  });
});

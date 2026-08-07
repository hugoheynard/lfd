import type { CreateSubscriptionPayload } from "@lfd/contracts";

import { CreateSubscriptionCommand } from "../create-subscription.command.js";
import { CreateSubscriptionHandler } from "../create-subscription.handler.js";
import { FakeSubscriptionRepository } from "./fake-subscription-repository.js";

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
    const handler = new CreateSubscriptionHandler(repo);

    const result = await handler.execute(new CreateSubscriptionCommand("user_1", payload));

    expect(result).toEqual({ id: "sub_created" });
    expect(repo.created).toHaveLength(1);
    const state = repo.created[0]?.toPersistence();
    expect(state?.status).toBe("active");
    expect(state?.placedByUserId).toBe("user_1");
    expect(state?.lines).toEqual([{ sku: "SKU-1", quantity: 2 }]);
  });
});

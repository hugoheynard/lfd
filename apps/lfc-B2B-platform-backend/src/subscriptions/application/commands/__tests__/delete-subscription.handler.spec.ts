import { NotFoundException } from "@nestjs/common";

import { DeleteSubscriptionCommand } from "../delete-subscription.command.js";
import { DeleteSubscriptionHandler } from "../delete-subscription.handler.js";
import { activeSubscription, FakeSubscriptionRepository } from "./fake-subscription-repository.js";

describe("DeleteSubscriptionHandler", () => {
  it("404 quand l'abonnement n'est pas au mur", async () => {
    const repo = new FakeSubscriptionRepository();
    const handler = new DeleteSubscriptionHandler(repo);

    await expect(
      handler.execute(new DeleteSubscriptionCommand("user_1", "sub_1")),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.removed).toHaveLength(0);
  });

  it("supprime l'abonnement au mur", async () => {
    const repo = new FakeSubscriptionRepository();
    repo.loadResult = activeSubscription("sub_42");
    const handler = new DeleteSubscriptionHandler(repo);

    await handler.execute(new DeleteSubscriptionCommand("user_1", "sub_42"));

    expect(repo.removed).toEqual(["sub_42"]);
  });
});

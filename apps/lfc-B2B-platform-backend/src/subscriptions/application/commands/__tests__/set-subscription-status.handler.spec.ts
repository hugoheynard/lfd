import { NotFoundException } from "@nestjs/common";

import { SubscriptionAlreadyActiveError } from "../../../domain/errors/subscription-errors.js";
import { SetSubscriptionStatusCommand } from "../set-subscription-status.command.js";
import { SetSubscriptionStatusHandler } from "../set-subscription-status.handler.js";
import { activeSubscription, FakeSubscriptionRepository } from "./fake-subscription-repository.js";

describe("SetSubscriptionStatusHandler", () => {
  it("404 quand l'abonnement n'est pas au mur (load rend null)", async () => {
    const repo = new FakeSubscriptionRepository();
    const handler = new SetSubscriptionStatusHandler(repo);

    await expect(
      handler.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "paused")),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.saved).toHaveLength(0);
  });

  it("met en pause un abonnement actif et le sauve", async () => {
    const repo = new FakeSubscriptionRepository();
    repo.loadResult = activeSubscription();
    const handler = new SetSubscriptionStatusHandler(repo);

    await handler.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "paused"));

    expect(repo.saved[0]?.toPersistence().status).toBe("paused");
  });

  it("laisse remonter le refus métier (reprendre un déjà actif)", async () => {
    const repo = new FakeSubscriptionRepository();
    repo.loadResult = activeSubscription();
    const handler = new SetSubscriptionStatusHandler(repo);

    await expect(
      handler.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "active")),
    ).rejects.toBeInstanceOf(SubscriptionAlreadyActiveError);
    expect(repo.saved).toHaveLength(0);
  });
});

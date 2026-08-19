import { NotFoundException } from "@nestjs/common";

import { UpsertOccurrenceOverrideCommand } from "../upsert-occurrence-override.command.js";
import { UpsertOccurrenceOverrideHandler } from "../upsert-occurrence-override.handler.js";
import { activeSubscription, FakeSubscriptionRepository } from "./fake-subscription-repository.js";

describe("UpsertOccurrenceOverrideHandler", () => {
  it("404 quand l'abonnement n'est pas au mur", async () => {
    const repo = new FakeSubscriptionRepository();
    const handler = new UpsertOccurrenceOverrideHandler(repo);

    await expect(
      handler.execute(
        new UpsertOccurrenceOverrideCommand("user_1", "sub_1", "2026-09-01", {
          skipped: true,
          lines: [],
          note: "",
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("déroge à l'échéance et sauve l'agrégat", async () => {
    const repo = new FakeSubscriptionRepository();
    repo.loadResult = activeSubscription();
    const handler = new UpsertOccurrenceOverrideHandler(repo);

    await handler.execute(
      new UpsertOccurrenceOverrideCommand("user_1", "sub_1", "2026-09-01", {
        skipped: false,
        lines: [{ sku: "SKU-2", quantity: 3 }],
        note: "",
      }),
    );

    const overrides = repo.saved[0]?.toPersistence().overrides ?? [];
    expect(overrides).toHaveLength(1);
    expect(overrides[0]?.lines).toEqual([{ sku: "SKU-2", quantity: 3 }]);
  });
});

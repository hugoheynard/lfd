import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import type { CreateSubscriptionPayload } from "@lfd/contracts";

import {
  catalogItem,
  noSaleOperations,
  saleOperationsOver,
} from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import { OperationOnlyInSubscriptionError } from "../../../domain/errors/subscription-errors.js";
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

/** L'horloge du service des opérations : aucune fenêtre n'est jugée ici. */
const NOW = new Date("2026-08-01T08:00:00.000Z");

describe("CreateSubscriptionHandler", () => {
  it("construit un agrégat actif et le confie au port, puis renvoie l'id", async () => {
    const repo = new FakeSubscriptionRepository();
    const handler = new CreateSubscriptionHandler(
      repo,
      new RecordingPublisher(),
      noSaleOperations(NOW),
    );

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
    const handler = new CreateSubscriptionHandler(
      new FakeSubscriptionRepository(),
      events,
      noSaleOperations(NOW),
    );

    await handler.execute(new CreateSubscriptionCommand("user_1", payload));

    expect(events.published).toHaveLength(1);
    const [event] = events.published;
    expect(event).toBeInstanceOf(SubscriptionCreatedEvent);
    const created = event as SubscriptionCreatedEvent;
    expect(created.subscriptionId).toBe("sub_created");
    expect(created.placedByUserId).toBe("user_1");
    expect(created.recurrence).toBe("weekly");
  });

  describe("un article d'opération datée (D6)", () => {
    const sale = saleOperationsOver({
      now: NOW,
      items: [catalogItem("PAT-002", { name: "Bûche" }), catalogItem("SKU-1")],
      onlySkus: ["PAT-002-1"],
    });

    it("est refusé à la création, en nommant l'article, et rien n'est écrit", async () => {
      const repo = new FakeSubscriptionRepository();
      const events = new RecordingPublisher();
      const handler = new CreateSubscriptionHandler(repo, events, sale);

      const refused = handler.execute(
        new CreateSubscriptionCommand("user_1", {
          ...payload,
          lines: [
            { sku: "SKU-1", quantity: 2 },
            { sku: "PAT-002", quantity: 1 },
          ],
        }),
      );

      await expect(refused).rejects.toBeInstanceOf(OperationOnlyInSubscriptionError);
      await expect(refused).rejects.toThrow(/« Bûche » ne se vend que pendant une opération/u);
      expect(repo.created).toHaveLength(0);
      expect(events.published).toHaveLength(0);
    });

    it("laisse passer un panier d'articles courants", async () => {
      const repo = new FakeSubscriptionRepository();
      const handler = new CreateSubscriptionHandler(repo, new RecordingPublisher(), sale);

      await handler.execute(new CreateSubscriptionCommand("user_1", payload));

      expect(repo.created).toHaveLength(1);
    });
  });
});

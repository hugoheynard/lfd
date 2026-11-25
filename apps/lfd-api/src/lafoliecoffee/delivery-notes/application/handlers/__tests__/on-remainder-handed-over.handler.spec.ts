import { OrderHandedOverEvent } from "../../../../../handover/channels/commerce/index.js";
import type { DurableSubscriber } from "../../../../../platform/outbox/durable-handler.js";
import {
  ON_REMAINDER_HANDED_OVER,
  OnRemainderHandedOver,
} from "../on-remainder-handed-over.handler.js";

/** Instant recopié dans le fait, jamais comparé à l'horloge. */
const HANDED_AT = new Date(7_000);

describe("OnRemainderHandedOver — muet, gardé inscrit pour la boîte d'envoi", () => {
  it("garde son nom d'abonné : les livraisons en vol le retrouvent", () => {
    expect(ON_REMAINDER_HANDED_OVER).toBe("b2b.delivery-notes.hand-over-remainder");
  });

  it.each([1, 2])("rend la main sans rien faire, au rang %i", async (rank) => {
    const subscriber: DurableSubscriber = new OnRemainderHandedOver();
    const fact = new OrderHandedOverEvent(
      "ord_1",
      rank,
      "ORD-0001",
      HANDED_AT,
      "s1",
      "scan",
    ).durableFact();
    await expect(
      subscriber.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload }),
    ).resolves.toBeUndefined();
  });
});

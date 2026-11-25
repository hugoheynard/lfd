import { PackingOrderPackedEvent } from "../../../../../packing/channels/commerce/index.js";
import type { DurableSubscriber } from "../../../../../platform/outbox/durable-handler.js";
import { ON_REMAINDER_PACKED, OnRemainderPacked } from "../on-remainder-packed.handler.js";

/** Instant recopié dans le fait, jamais comparé à l'horloge. */
const PACKED_AT = new Date(5_000);

describe("OnRemainderPacked — muet, gardé inscrit pour la boîte d'envoi", () => {
  it("garde son nom d'abonné : les livraisons en vol le retrouvent", () => {
    expect(ON_REMAINDER_PACKED).toBe("b2b.delivery-notes.prepare-remainder");
  });

  it.each([1, 2])("rend la main sans rien faire, au rang %i", async (rank) => {
    const subscriber: DurableSubscriber = new OnRemainderPacked();
    const fact = new PackingOrderPackedEvent(
      "ord_1",
      rank,
      "ORD-0001",
      PACKED_AT,
      "s1",
    ).durableFact();
    await expect(
      subscriber.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload }),
    ).resolves.toBeUndefined();
  });
});

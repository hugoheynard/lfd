import { PackingListDrawnEvent } from "../../../../production/channels/packing/index.js";
import { PackingSettings } from "../../../domain/entities/packing-settings.js";
import type { PackingTrackingLevel } from "../../../domain/entities/packing-tracking-level.js";
import { InMemoryPackingSettings } from "../../__tests__/packing-settings-doubles.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { OnPackingListDrawn } from "../on-packing-list-drawn.handler.js";

/**
 * D3 : le niveau de suivi se fige à la naissance d'une fiche. Instant
 * recopié, jamais comparé à l'horloge.
 */
const AT = new Date(0);
const DAY = "1970-01-02";

function fact(orderId: string, rank: number, method: "pickup" | "delivery", day = DAY) {
  const durable = new PackingListDrawnEvent(day, AT, {
    orderId,
    rank,
    reference: `ORD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: method,
    dueAt: null,
    clientele: null,
    siteId: null,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 1, saleUnit: "piece" }],
  }).durableFact();
  return { eventId: durable.key, type: durable.type, payload: durable.payload };
}

function setup(level: PackingTrackingLevel | null) {
  const shadow = new InMemoryShadow();
  const settings = new InMemoryPackingSettings(
    level === null
      ? null
      : PackingSettings.of({
          halfSharing: false,
          showMadeToOrder: true,
          pickupTrackingLevel: level,
        }),
  );
  const handler = new OnPackingListDrawn(shadow, settings.reader(), shadow.origins());
  const levelOf = (orderId: string, rank: number, day = DAY) =>
    shadow.orders.get(`${day}/${orderId}/${String(rank)}`)?.trackingLevel;
  return { shadow, settings, handler, levelOf };
}

describe("OnPackingListDrawn — le niveau de suivi figé (D3)", () => {
  it("un retrait naît au niveau par défaut, simple, quand personne n'a rien réglé", async () => {
    const { handler, levelOf } = setup(null);

    await handler.handle(fact("ord_1", 1, "pickup"));

    expect(levelOf("ord_1", 1)).toBe("simple");
  });

  it("un retrait naît au niveau réglé", async () => {
    const { handler, levelOf } = setup("detailed");

    await handler.handle(fact("ord_1", 1, "pickup"));

    expect(levelOf("ord_1", 1)).toBe("detailed");
  });

  it("une livraison ne fige rien, quel que soit le réglage (D1)", async () => {
    const { handler, levelOf } = setup("simple");

    await handler.handle(fact("ord_1", 1, "delivery"));

    expect(levelOf("ord_1", 1)).toBeNull();
  });

  it("un reliquat prend le niveau de sa fiche d'origine, pas le réglage du moment", async () => {
    const { handler, settings, levelOf } = setup("simple");
    await handler.handle(fact("ord_1", 1, "pickup"));
    settings.posed = PackingSettings.of({
      halfSharing: false,
      showMadeToOrder: true,
      pickupTrackingLevel: "detailed",
    });

    await handler.handle(fact("ord_1", 2, "pickup"));

    expect(levelOf("ord_1", 2)).toBe("simple");
  });

  it("un reliquat d'un jour suivant relit l'origine d'un jour précédent", async () => {
    const { handler, levelOf } = setup("detailed");
    await handler.handle(fact("ord_1", 1, "pickup", "1970-01-01"));

    await handler.handle(fact("ord_1", 2, "pickup"));

    expect(levelOf("ord_1", 2)).toBe("detailed");
  });

  it("un reliquat sans fiche d'origine ne fige rien", async () => {
    const { handler, levelOf } = setup("simple");

    await handler.handle(fact("ord_1", 2, "pickup"));

    expect(levelOf("ord_1", 2)).toBeNull();
  });

  it("une fiche déjà née garde son niveau quand le réglage change puis que la liste est rejouée", async () => {
    const { handler, settings, levelOf } = setup("simple");
    await handler.handle(fact("ord_1", 1, "pickup"));
    settings.posed = PackingSettings.of({
      halfSharing: false,
      showMadeToOrder: true,
      pickupTrackingLevel: "detailed",
    });

    await handler.handle(fact("ord_1", 1, "pickup"));

    expect(levelOf("ord_1", 1)).toBe("simple");
  });
});

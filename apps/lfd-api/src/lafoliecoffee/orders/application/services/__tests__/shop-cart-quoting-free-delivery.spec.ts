import type { AdminDeliveryZoneView, CartAdjustment, ShopQuotePayload } from "@lfd/contracts";

import { catalogItem, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **La livraison offerte au panier** (plan `plan-livraison-offerte.md`, 1c) :
 * le devis dit « offert » (sans montant — « Coursier offert », Hugo,
 * 2026-11-05) ou ce qu'il manque, en HT comme le seuil ; et rien quand il
 * n'y a rien à dire. Le pain vaut 5,00 € HT.
 */
const THRESHOLD = 1_500;
const FEE: CartAdjustment = { mode: "amount", cents: 1_000 };
const DELIVERY = { method: "delivery", codePostal: "73000" } as const;

function zone(threshold: number | null, fee: CartAdjustment = FEE): AdminDeliveryZoneView {
  const terms = { fee: null, freeDeliveryThresholdCents: threshold };
  return {
    id: "z1",
    postalPrefixes: ["73"],
    label: "Savoie",
    fee,
    audienceTerms: { b2b: terms, b2c: terms },
  };
}

async function quoteOf(
  quantity: number,
  options: {
    readonly zone?: AdminDeliveryZoneView;
    readonly fulfillment?: ShopQuotePayload["fulfillment"];
    readonly companyId?: string | null;
  } = {},
) {
  const companyId = options.companyId === undefined ? "co_1" : options.companyId;
  const { view } = await quotingOf({
    catalog: [catalogItem("PAI-001", "Pain", 500_000, 5.5)],
    companyStatus: "active",
    zone: options.zone ?? zone(THRESHOLD),
  }).quote({
    payload: {
      lines: [{ sku: "PAI-001", quantity }],
      fulfillment: options.fulfillment === undefined ? DELIVERY : options.fulfillment,
    },
    companyId,
    buyerUserId: null,
  });
  return view;
}

describe("ShopCartQuoting — la livraison offerte (1c)", () => {
  it("sous le seuil : le manque HT, et le coursier facturé", async () => {
    const view = await quoteOf(2);
    expect(view.freeDelivery).toEqual({ status: "short", remainingCents: 500 });
    expect(view.deliveryFeeCents).toBe(1_000);
  });

  it("pile au seuil : offert, sans montant, frais à zéro", async () => {
    const view = await quoteOf(3);
    expect(view.freeDelivery).toEqual({ status: "offered" });
    expect(view.deliveryFeeCents).toBe(0);
  });

  it("au-delà du seuil : offert", async () => {
    expect((await quoteOf(5)).freeDelivery).toEqual({ status: "offered" });
  });

  it("un particulier (composé en TTC) : le manque HT, et son TTC « environ » arrondi au-dessus", async () => {
    const view = await quoteOf(2, { companyId: null });
    // Deux pains : 10,00 € HT, 10,55 € TTC → 500 × 1 055 / 1 000 = 527,5 → 528.
    expect(view.freeDelivery).toEqual({
      status: "short",
      remainingCents: 500,
      remainingTtcCents: 528,
    });
  });

  it("un pro (line_ht) : le manque HT seul, sans TTC", async () => {
    const view = await quoteOf(2);
    expect(view.freeDelivery).not.toHaveProperty("remainingTtcCents");
  });

  it("sans seuil réglé : la clé est absente", async () => {
    expect(await quoteOf(2, { zone: zone(null) })).not.toHaveProperty("freeDelivery");
  });

  it("en retrait : la clé est absente", async () => {
    const view = await quoteOf(2, {
      fulfillment: { method: "pickup", pickupAddressId: "pickup_1" },
    });
    expect(view).not.toHaveProperty("freeDelivery");
  });

  it("sans acheminement : la clé est absente", async () => {
    expect(await quoteOf(2, { fulfillment: null })).not.toHaveProperty("freeDelivery");
  });

  it("une zone gratuite : rien à promettre, la clé est absente", async () => {
    const view = await quoteOf(2, { zone: zone(THRESHOLD, { mode: "amount", cents: 0 }) });
    expect(view).not.toHaveProperty("freeDelivery");
  });
});

import type { ShopQuoteView } from "@lfd/contracts";

import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import { catalogItem, PRICED_AT, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis annonce chaque remise cumulée** (plan des promotions, § 18.6,
 * lot M7) : deux promotions panier cumulables s'enchaînent, `discounts[]`
 * porte une entrée par remise, et leur somme est `discountCents`. Une seule
 * remise garde la vue d'hier, sans la clé.
 */
const CATALOG = [
  catalogItem("BAN-001", "Banana bread", 1_990_521, 5.5),
  catalogItem("TAS-001", "Tasse", 1_000_000, 20),
];
const PICKUP = { method: "pickup" as const, pickupAddressId: "pickup_1" };
const LINES = [
  { sku: "BAN-001", quantity: 2 },
  { sku: "TAS-001", quantity: 1 },
];

function cumulative(id: string, basisPoints: number): LivePromotion {
  return livePromotion({
    id,
    label: `Promo ${id}`,
    effect: { kind: "percent_off", basisPoints },
    cumulative: true,
    validFrom: PRICED_AT,
    fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
  });
}

async function quoted(
  promotions: readonly LivePromotion[],
  companyId: string | null,
): Promise<ShopQuoteView> {
  const { view } = await quotingOf({
    catalog: CATALOG,
    basketPromotions: promotions,
    companyStatus: companyId === null ? null : "active",
  }).quote({ payload: { lines: LINES, fulfillment: PICKUP }, companyId, buyerUserId: "user_1" });
  return view;
}

const sumOf = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0);

describe("ShopCartQuoting — deux promotions panier cumulables (M7)", () => {
  it.each([
    ["un pro (line_ht)", "co_1"],
    ["un particulier (exact_ht)", null],
  ])("%s : une entrée par remise, dans l'ordre, Σ = discountCents", async (_label, companyId) => {
    const view = await quoted([cumulative("b", 500), cumulative("a", 1_000)], companyId);

    expect(view.discountAdjustment).toBeNull();
    expect(view.discounts?.map((discount) => discount.label?.fr)).toEqual(["Promo a", "Promo b"]);
    expect(view.discounts?.map((discount) => discount.adjustment)).toEqual([
      { mode: "percent", bp: 1_000 },
      { mode: "percent", bp: 500 },
    ]);
    expect(sumOf(view.discounts?.map((discount) => discount.amountCents) ?? [])).toBe(
      view.discountCents,
    );
    // Le total retombe : HT net + TVA = TTC.
    expect(
      view.subtotalHtCents - view.discountCents + sumOf(view.vat.map((share) => share.amountCents)),
    ).toBe(view.totalCents);
  });

  it("un particulier : chaque remise porte son TTC", async () => {
    const view = await quoted([cumulative("a", 1_000), cumulative("b", 500)], null);

    expect(view.discounts?.every((discount) => (discount.amountTtcCents ?? 0) > 0)).toBe(true);
  });

  it("une seule cumulable : la vue d'hier, sans `discounts`", async () => {
    const view = await quoted([cumulative("a", 1_000)], "co_1");

    expect(view.discountAdjustment).toEqual({ mode: "percent", bp: 1_000 });
    expect(view).not.toHaveProperty("discounts");
  });
});

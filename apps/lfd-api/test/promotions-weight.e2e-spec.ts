/**
 * E2E — **un pourcentage s'étend aux articles au poids** (décision de Hugo du
 * 2026-10-31, `documentation/promotions/promotions.md`, § 2.2).
 *
 * Ce que seul ce niveau prouve : la promotion posée par l'écran, relue en
 * base, baisse le prix au kilo AU RAYON et AU PANIER d'un article au poids
 * qu'elle ne couvre que par « tout sauf » ; un montant et un pourcentage à
 * quantité minimum ne le touchent pas.
 */
import type { PromotionTermsPayload, ShopCatalogueView, ShopQuoteView } from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";

const SKU = "VIE-001-1";
const WEIGHED = { sku: SKU, quantity: 1_250, saleUnit: "weight" as const };
/** L'étiquette publique : 42,20 € TTC le kilo, soit 39,99052 € HT à 5,5 %. */
const PUBLIC_HT_PER_KG_MILLICENTS = 3_999_052;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.catalogItem.update({
    where: { sku: SKU },
    data: {
      saleUnit: "weight",
      weightStepGrams: 50,
      weightMinGrams: 200,
      priceMillicents: 4_000_000,
      publicTtcCents: 4_220,
      publicByContext: {
        takeaway: { vatRatePercent: 5.5, htMillicents: PUBLIC_HT_PER_KG_MILLICENTS },
      },
    },
  });
  ctx.app.get(PricingMaterialsCache).invalidate();
});

async function pose(over: Partial<PromotionTermsPayload>): Promise<void> {
  await posePromotion(ctx.asSub(E2E_STAFF_SUB), promotionTerms(over));
  ctx.app.get(PricingMaterialsCache).invalidate();
}

async function shelfPrice(): Promise<number | undefined> {
  const body = jsonBody<ShopCatalogueView>(await ctx.http().get("/shop/catalogue").expect(200));
  return body.items.find((item) => item.sku === SKU)?.unitPriceMillicents;
}

async function quotedLine() {
  const view = jsonBody<ShopQuoteView>(
    await ctx
      .http()
      .post("/shop/quote")
      .send({ lines: [WEIGHED], fulfillment: null })
      .expect(200),
  );
  return view.lines[0];
}

describe("une promotion au prix affiché, sur un article au poids", () => {
  it("« −10 % tout sauf » baisse le prix au kilo au rayon et au panier", async () => {
    const before = await shelfPrice();
    await pose({ effect: { kind: "percent_off", value: 1_000 } });

    const shelf = await shelfPrice();
    const line = await quotedLine();

    expect(before).toBe(PUBLIC_HT_PER_KG_MILLICENTS);
    expect(shelf).toBe(Math.round(PUBLIC_HT_PER_KG_MILLICENTS * 0.9));
    expect(line).toMatchObject({ sku: SKU, saleUnit: "weight", unitPriceMillicents: shelf });
  });

  it("« −0,50 € » ne le touche pas", async () => {
    await pose({ effect: { kind: "unit_amount_off", value: 50_000 } });

    expect(await shelfPrice()).toBe(PUBLIC_HT_PER_KG_MILLICENTS);
    expect((await quotedLine())?.unitPriceMillicents).toBe(PUBLIC_HT_PER_KG_MILLICENTS);
  });

  it("« −10 % dès 3 » ne le touche pas, même à 1 250 g", async () => {
    await pose({
      effect: { kind: "percent_off", value: 1_000 },
      conditions: [{ kind: "min_quantity", value: 3 }],
    });

    expect(await shelfPrice()).toBe(PUBLIC_HT_PER_KG_MILLICENTS);
    expect((await quotedLine())?.unitPriceMillicents).toBe(PUBLIC_HT_PER_KG_MILLICENTS);
  });
});

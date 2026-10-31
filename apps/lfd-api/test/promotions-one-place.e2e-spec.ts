/**
 * E2E du `documentation/promotions/promotions.md`, § 2.15 (2026-10-31),
 * sur le vrai Postgres : une promotion se règle à un seul endroit, l'écran
 * Promotions, et le passage d'un acheminement à l'autre n'y est plus refusé.
 *
 * La promotion du point a la forme exacte de la reprise d'une remise de site
 * (§ 13.4 du plan principal : « tous sauf les pros actifs », retrait à CE
 * point, sur tout) ; la reprise elle-même est close et ne se rejoue plus.
 *
 * Les fenêtres sont relatives (`daysAgo`) : elles sont jugées à l'horloge.
 */
import type {
  CreatedPickupResponse,
  PickupAddressView,
  PromotionTermsPayload,
  ShopQuoteView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

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
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

const LINES = [{ sku: "VIE-001-1", quantity: 8 }];

async function poseSite(): Promise<string> {
  const response = await staff()
    .post("/admin/pickup-addresses")
    .send({
      label: "Cœur de station",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      opening: { publicOpening: null, proPickup: null },
      discounts: { b2b: null, b2c: null },
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

/** La remise de retrait d'un site, telle que la reprise l'a écrite. */
function siteDiscount(fulfillment: PromotionTermsPayload["fulfillment"]): PromotionTermsPayload {
  return {
    internalName: "Remise de retrait · particuliers",
    label: { fr: "Remise de retrait", en: null, it: null },
    reason: null,
    effect: { kind: "percent_off", value: 2_000 },
    ownFloor: null,
    cumulative: false,
    validFrom: daysAgo(1),
    validTo: null,
    audienceLabels: { individuals: null, pros: null },
    audiences: [{ kind: "everyone_but_active_pros", companyId: null }],
    fulfillment,
    scope: { mode: "all_except", rules: [] },
    conditions: [],
  };
}

async function quoteAt(pickupAddressId: string): Promise<ShopQuoteView> {
  const body = { lines: LINES, fulfillment: { method: "pickup", pickupAddressId } };
  return jsonBody<ShopQuoteView>(await ctx.http().post("/shop/quote").send(body).expect(200));
}

async function announcedAt(pickupId: string): Promise<PickupAddressView["discounts"]["b2c"]> {
  const points = jsonBody<readonly PickupAddressView[]>(
    await ctx.http().get("/pickup-addresses").expect(200),
  );
  return points.find((point) => point.id === pickupId)?.discounts.b2c ?? null;
}

function lineTotalOf(quote: ShopQuoteView): number {
  return quote.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
}

describe("une promotion se règle à un seul endroit", () => {
  /**
   * Régression (production, 2026-10-31) : réviser la promotion reprise d'un
   * site de « retrait à ce point » vers « tous acheminements » était refusé —
   * « Une promotion de retrait à un point se règle depuis ce point de
   * retrait ».
   */
  it("la remise d'un site passe à « tous acheminements » : journalisée, prix de ligne baissé, annonce du point retirée", async () => {
    const site = await poseSite();
    const posed = await staff()
      .post("/admin/promotions")
      .send(siteDiscount({ kind: "basket", pickup: { points: [site] }, delivery: "none" }))
      .expect(201);
    const { id } = jsonBody<{ id: string }>(posed);
    const before = await quoteAt(site);
    expect(before.discountCents).toBeGreaterThan(0);
    expect(await announcedAt(site)).not.toBeNull();

    await staff()
      .put(`/admin/promotions/${id}`)
      .send({ terms: siteDiscount({ kind: "displayed_price" }), reason: "un seul endroit" })
      .expect(204);

    const events = await ctx.prisma.pricingEvent.findMany({
      where: { subjectType: "promotion", subjectId: id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    expect(events.map((event) => event.act)).toEqual(["posed", "replaced"]);
    const after = await quoteAt(site);
    expect(lineTotalOf(after)).toBeLessThan(lineTotalOf(before));
    expect(after.discountCents).toBe(0);
    expect(await announcedAt(site)).toBeNull();
  });
});

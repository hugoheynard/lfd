/**
 * E2E du **réglage global de livraison par audience** et des remplacements par
 * zone (plan `documentation/promotions/plan-livraison-offerte.md`, sous-lot
 * 0a) : lecture et écriture staff, ligne absente = rien de réglé, auteur figé,
 * refus nommés, colonnes de zone nulles — et SURTOUT rien de changé au frais :
 * un devis livré coûte toujours le frais de la zone, réglage posé ou non.
 */
import {
  DEFAULT_DELIVERY_PRICING,
  type CreatedDeliveryZoneResponse,
  type DeliveryPricingView,
  type DeliveryZoneView,
  type ShopQuoteView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

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
});

const ZONE_FEE_CENTS = 2_000;
const ZONE = {
  label: "Val d'Isère",
  postalPrefixes: ["73150"],
  fee: { mode: "amount", cents: ZONE_FEE_CENTS },
};
const DELIVERY_QUOTE = {
  lines: [{ sku: "VIE-001-1", quantity: 10 }],
  fulfillment: { method: "delivery", codePostal: "73150" },
};
const GLOBAL = {
  b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: 5_000 },
  b2c: { fee: { mode: "percent", bp: 1_000 }, freeDeliveryThresholdCents: 1 },
};

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function adminView(): Promise<DeliveryPricingView> {
  return jsonBody<DeliveryPricingView>(await staff().get("/admin/delivery-pricing").expect(200));
}

async function createZone(body: Record<string, unknown> = ZONE): Promise<string> {
  const response = await staff().post("/admin/delivery-zones").send(body).expect(201);
  return jsonBody<CreatedDeliveryZoneResponse>(response).id;
}

async function zoneOverrides(id: string): Promise<readonly (number | string | null)[]> {
  const row = await ctx.prisma.deliveryZone.findUniqueOrThrow({ where: { id } });
  return [
    row.b2bFeeMode,
    row.b2bFeeValue,
    row.b2bFreeDeliveryThresholdCents,
    row.b2cFeeMode,
    row.b2cFeeValue,
    row.b2cFreeDeliveryThresholdCents,
  ];
}

async function quotedDeliveryFee(): Promise<number> {
  const response = await ctx.http().post("/shop/quote").send(DELIVERY_QUOTE).expect(200);
  return jsonBody<ShopQuoteView>(response).deliveryFeeCents;
}

describe("le réglage global de livraison", () => {
  it("ligne absente : rien de réglé, sans auteur ni instant", async () => {
    expect(await adminView()).toEqual(DEFAULT_DELIVERY_PRICING);
    expect(await ctx.prisma.deliveryPricing.count()).toBe(0);
  });

  it("pose les deux audiences, puis n'en change qu'une valeur, et fige qui et quand", async () => {
    await staff().patch("/admin/delivery-pricing").send(GLOBAL).expect(204);
    await staff()
      .patch("/admin/delivery-pricing")
      .send({ b2c: { freeDeliveryThresholdCents: null } })
      .expect(204);

    const view = await adminView();
    expect(view.b2b).toEqual(GLOBAL.b2b);
    expect(view.b2c).toEqual({ fee: GLOBAL.b2c.fee, freeDeliveryThresholdCents: null });
    expect(view.updatedAt).not.toBeNull();
    expect(view.updatedBy).not.toBeNull();
  });

  it("refuse un franco négatif (400 nommé) et un patch vide (400), sans rien écrire", async () => {
    const refused = await staff()
      .patch("/admin/delivery-pricing")
      .send({ b2b: { freeDeliveryThresholdCents: -1 } })
      .expect(400);
    expect((refused.body as { code?: string }).code).toBe(
      "delivery_pricing.invalid_free_delivery_threshold",
    );
    await staff().patch("/admin/delivery-pricing").send({}).expect(400);

    expect(await ctx.prisma.deliveryPricing.count()).toBe(0);
  });

  it("n'est pas servi sans jeton", async () => {
    await ctx.http().get("/admin/delivery-pricing").expect(401);
  });
});

describe("les remplacements par zone", () => {
  it("une zone créée sans eux les a nuls, et la route publique ne les sert pas", async () => {
    const id = await createZone();

    expect(await zoneOverrides(id)).toEqual([null, null, null, null, null, null]);
    const zones = jsonBody<DeliveryZoneView[]>(await ctx.http().get("/delivery-zones").expect(200));
    expect(zones).toEqual([
      { id, label: ZONE.label, postalPrefixes: ZONE.postalPrefixes, fee: ZONE.fee },
    ]);
  });

  it("posés à la création ; une modification qui ne les dit pas n'y touche pas", async () => {
    const id = await createZone({
      ...ZONE,
      audienceTerms: {
        b2b: { fee: { mode: "amount", cents: 300 }, freeDeliveryThresholdCents: 4_000 },
        b2c: { fee: null, freeDeliveryThresholdCents: null },
      },
    });
    await staff()
      .patch(`/admin/delivery-zones/${id}`)
      .send({ ...ZONE, label: "Tignes" })
      .expect(204);

    expect(await zoneOverrides(id)).toEqual(["amount", 300, 4_000, null, null, null]);
  });

  it("refuse un remplacement invalide (400), sans créer la zone", async () => {
    await staff()
      .post("/admin/delivery-zones")
      .send({
        ...ZONE,
        audienceTerms: {
          b2b: { fee: null, freeDeliveryThresholdCents: -5 },
          b2c: { fee: null, freeDeliveryThresholdCents: null },
        },
      })
      .expect(400);

    expect(await ctx.prisma.deliveryZone.count()).toBe(0);
  });
});

describe("le frais facturé est inchangé (0a)", () => {
  it("un devis livré coûte le frais de la zone, avant comme après un réglage global et un remplacement", async () => {
    const id = await createZone();
    expect(await quotedDeliveryFee()).toBe(ZONE_FEE_CENTS);

    await staff().patch("/admin/delivery-pricing").send(GLOBAL).expect(204);
    await staff()
      .patch(`/admin/delivery-zones/${id}`)
      .send({ ...ZONE, audienceTerms: GLOBAL })
      .expect(204);

    expect(await quotedDeliveryFee()).toBe(ZONE_FEE_CENTS);
  });
});

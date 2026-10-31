/**
 * E2E du `documentation/promotions/promotions.md`, § 2.14
 * (), sur le vrai Postgres : **un point + une zone en UNE
 * promotion**.
 *
 * 1. la remise s'applique au retrait à ce point et en livraison dans cette
 *    zone — pas à un autre point, pas dans une autre zone ;
 * 2. le point l'annonce, pas l'autre ;
 * 3. le rayon mentionne l'ENSEMBLE ; le devis anonyme offre la connexion au
 *    point et dans la zone, pas ailleurs ;
 * 4. un point ou une zone inconnu est un refus nommé, jamais une violation
 *    de clé étrangère ;
 * 5. une zone qu'une promotion non archivée nomme ne se supprime pas.
 *
 * Les fenêtres sont relatives (`daysAgo`) : elles sont jugées à l'horloge.
 */
import type {
  CreatedPickupResponse,
  PickupAddressView,
  PromotionTermsPayload,
  ShopCatalogueView,
  ShopQuoteView,
} from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const REGISTERED = "auth0|zone-inscrit";
const SKU = "VIE-001-1";
const LINES = [{ sku: SKU, quantity: 4 }];
const IN_ZONE = "73150";
const OTHER_ZONE = "73320";

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

interface Scene {
  readonly labo: string;
  readonly gare: string;
  readonly vallee: string;
}

async function site(label: string): Promise<string> {
  return jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .send({
        label,
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: IN_ZONE,
        ville: "Val d'Isère",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
}

/** Deux points, deux zones, un particulier inscrit — puis la bascule. */
async function scene(): Promise<Scene> {
  await createUser(ctx.prisma, { auth0Sub: REGISTERED });
  const vallee = await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: [IN_ZONE], label: "La vallée", feeMode: "amount", feeValue: 500 },
  });
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: [OTHER_ZONE], label: "Le sommet", feeMode: "amount", feeValue: 700 },
  });
  const labo = await site("Le Labo");
  const gare = await site("La Gare");
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
  return { labo, gare, vallee: vallee.id };
}

function terms(scene: Scene, over: Partial<PromotionTermsPayload> = {}): PromotionTermsPayload {
  return {
    internalName: "Labo et vallée",
    label: { fr: "−10 % au Labo et en vallée", en: null, it: null },
    audienceLabels: { individuals: null, pros: null },
    reason: null,
    effect: { kind: "percent_off", value: 1_000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    cumulative: false,
    validFrom: daysAgo(1),
    validTo: null,
    audiences: [{ kind: "everyone", companyId: null }],
    fulfillment: {
      kind: "basket",
      pickup: { points: [scene.labo] },
      delivery: { zones: [scene.vallee] },
    },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...over,
  };
}

async function pose(body: PromotionTermsPayload): Promise<string> {
  const id = jsonBody<{ id: string }>(
    await staff().post("/admin/promotions").send(body).expect(201),
  ).id;
  ctx.app.get(PricingMaterialsCache).invalidate();
  return id;
}

async function registeredQuote(fulfillment: unknown): Promise<ShopQuoteView> {
  return jsonBody<ShopQuoteView>(
    await ctx
      .asSub(REGISTERED)
      .post("/shop/quote/mine")
      .send({ lines: LINES, fulfillment })
      .expect(200),
  );
}

async function anonymousQuote(fulfillment: unknown): Promise<ShopQuoteView> {
  return jsonBody<ShopQuoteView>(
    await ctx.http().post("/shop/quote").send({ lines: LINES, fulfillment }).expect(200),
  );
}

const atPoint = (pickupAddressId: string) => ({ method: "pickup", pickupAddressId });
const deliveredTo = (codePostal: string) => ({ method: "delivery", codePostal });

describe("un point + une zone en UNE promotion", () => {
  it("remise au retrait à ce point et en livraison dans cette zone, pas ailleurs", async () => {
    const sc = await scene();
    const id = await pose(terms(sc));

    const atLabo = await registeredQuote(atPoint(sc.labo));
    const inVallee = await registeredQuote(deliveredTo(IN_ZONE));
    expect(atLabo.discountCents).toBeGreaterThan(0);
    expect(inVallee.discountCents).toBe(atLabo.discountCents);
    expect((await registeredQuote(atPoint(sc.gare))).discountCents).toBe(0);
    expect((await registeredQuote(deliveredTo(OTHER_ZONE))).discountCents).toBe(0);

    // Une seule promotion, relue telle que posée.
    const stored = await ctx.prisma.promotion.findUniqueOrThrow({
      where: { id },
      include: { pickupPoints: true, deliveryZones: true },
    });
    expect([stored.fulfillmentPickup, stored.fulfillmentDelivery]).toEqual(["listed", "listed"]);
    expect(stored.pickupPoints.map((link) => link.pickupId)).toEqual([sc.labo]);
    expect(stored.deliveryZones.map((link) => link.zoneId)).toEqual([sc.vallee]);
  });

  it("le journal nomme le point et la zone par leur libellé", async () => {
    const sc = await scene();
    const id = await pose(terms(sc));

    const act = await ctx.prisma.pricingEvent.findFirstOrThrow({ where: { subjectId: id } });
    expect(act.summary).toContain("retrait au point Le Labo et livraison en zone La vallée");
  });

  it("le point l'annonce, l'autre point non", async () => {
    const sc = await scene();
    await pose(terms(sc));

    const points = jsonBody<readonly PickupAddressView[]>(
      await ctx.http().get("/pickup-addresses").expect(200),
    );
    const announced = (id: string) => points.find((point) => point.id === id)?.discounts.b2c;
    expect(announced(sc.labo)?.adjustment).toEqual({ mode: "percent", bp: 1_000 });
    expect(announced(sc.gare)).toBeNull();
  });

  it("le rayon mentionne l'ensemble, sans baisser le prix", async () => {
    const sc = await scene();
    await pose(terms(sc));

    const item = jsonBody<ShopCatalogueView>(
      await ctx.http().get("/shop/catalogue").expect(200),
    ).items.find((entry) => entry.sku === SKU);
    expect(item?.fulfillmentOffers).toEqual([
      {
        effect: { kind: "percent", basisPoints: 1_000 },
        fulfillment: { pickup: { points: [sc.labo] }, delivery: { zones: [sc.vallee] } },
      },
    ]);
  });

  it("le devis anonyme offre la connexion au point et dans la zone, pas ailleurs", async () => {
    const sc = await scene();
    await pose(terms(sc, { audiences: [{ kind: "individuals_registered", companyId: null }] }));
    const offered = { effect: { kind: "percent", basisPoints: 1_000 } };

    expect((await anonymousQuote(atPoint(sc.labo))).signInOffer).toEqual(offered);
    expect((await anonymousQuote(deliveredTo(IN_ZONE))).signInOffer).toEqual(offered);
    expect(await anonymousQuote(atPoint(sc.gare))).not.toHaveProperty("signInOffer");
    expect(await anonymousQuote(deliveredTo(OTHER_ZONE))).not.toHaveProperty("signInOffer");
  });
});

describe("ce que la promotion nomme doit exister (§ 9)", () => {
  it.each([
    ["une zone inconnue", "delivery"],
    ["un point inconnu", "pickup"],
  ] as const)("refuse %s en le nommant", async (_case, side) => {
    const sc = await scene();
    const fulfillment: PromotionTermsPayload["fulfillment"] =
      side === "delivery"
        ? { kind: "basket", pickup: "none", delivery: { zones: ["zone_fantome"] } }
        : { kind: "basket", pickup: { points: ["site_fantome"] }, delivery: "none" };

    const refused = await staff()
      .post("/admin/promotions")
      .send(terms(sc, { fulfillment }))
      .expect(400);

    expect(jsonBody<{ code: string; message: string }>(refused)).toMatchObject({
      code: "promotions.fulfillment_target_unknown",
      message: expect.stringContaining("fantome") as unknown,
    });
    expect(await ctx.prisma.promotion.count()).toBe(0);
  });

  it("refuse de supprimer une zone qu'une promotion nomme, archivée comprise, et la liste reste lisible", async () => {
    const sc = await scene();
    const id = await pose(terms(sc));
    const refusalOf = async () =>
      jsonBody<{ code: string; message: string }>(
        await staff().delete(`/admin/delivery-zones/${sc.vallee}`).expect(409),
      );

    expect(await refusalOf()).toEqual({
      code: "delivery_zone.targeted_by_promotion",
      message:
        "Cette zone est nommée par la promotion « Labo et vallée » : une promotion garde la trace de ses zones.",
      requestId: expect.any(String) as unknown,
    });

    await staff()
      .post(`/admin/promotions/${id}/archive`)
      .send({ reason: "fin de saison" })
      .expect(204);
    expect((await refusalOf()).message).toBe(
      "Cette zone est nommée par la promotion « Labo et vallée » (archivée) : une promotion garde la trace de ses zones.",
    );

    expect(await ctx.prisma.deliveryZone.count({ where: { id: sc.vallee } })).toBe(1);
    expect(await ctx.prisma.promotionDeliveryZone.count({ where: { promotionId: id } })).toBe(1);
    await staff().get("/admin/promotions").expect(200);
  });
});

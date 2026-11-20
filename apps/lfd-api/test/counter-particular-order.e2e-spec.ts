/**
 * E2E de la **commande d'un particulier notée au comptoir**, réglée à la caisse
 * de la boutique (`/admin/counter/particular-orders`) — plan
 * `documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md`, § 4–5.
 *
 * Ce qui ne se prouve qu'ici : le prix que le particulier verrait dans son
 * espace, une promotion réservée aux pros qui ne l'atteint pas, la forme
 * `shop_till` acceptée par le CHECK de la base, la fiche d'un membre de
 * société refusée par le SQL d'`account`, et le rejeu sur le vrai registre des
 * intentions. Les fenêtres sont relatives (`daysAgo`, `serviceDay`).
 */
import type {
  AdminOrderEstimateView,
  CounterParticularPlacedOrderResponse,
  CreatedPickupResponse,
  PlacedOrderResponse,
} from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardProvidersOverride } from "./card-payments.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const ROUTE = "/admin/counter/particular-orders";
const PARTICULAR_SUB = "auth0|b3-particulier";
const PRO_SUB = "auth0|b3-pro";
const SERVICE_DAY = serviceDay();
const WINDOW = { start: "07:00", end: "08:00" };
const LINES = [
  { sku: "VIE-001-1", quantity: 8 },
  { sku: "PAI-001-1", quantity: 4 },
];

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    // La carte du particulier qui passe le même panier dans son espace.
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      cardProvidersOverride("pi_b3"),
    ],
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
  readonly site: string;
  readonly particularId: string;
  readonly memberId: string;
}

/** Un point de retrait, un particulier inscrit, un pro membre d'une société active. */
async function scene(): Promise<Scene> {
  const particular = await createUser(ctx.prisma, { auth0Sub: PARTICULAR_SUB });
  const pro = await createUser(ctx.prisma, { auth0Sub: PRO_SUB });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, pro.id, company.id, CustomerRole.owner);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const site = jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .set(INTENT_KEY, freshIntent())
      .send({
        label: "Le Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
  return { site, particularId: particular.id, memberId: pro.id };
}

/** Une promotion panier de 10 % réservée aux pros, au point du décor. */
async function proOnlyPromotion(site: string): Promise<void> {
  await staff()
    .post("/admin/promotions")
    .set(INTENT_KEY, freshIntent())
    .send({
      internalName: "Réservée aux pros",
      label: { fr: "Offre pro", en: null, it: null },
      audienceLabels: { individuals: null, pros: null },
      reason: null,
      effect: { kind: "percent_off", value: 1_000 },
      ownFloor: null,
      validFrom: daysAgo(1),
      validTo: null,
      audiences: [{ kind: "pros", companyId: null }],
      fulfillment: { kind: "basket", pickup: { points: [site] }, delivery: "none" },
      scope: { mode: "all_except", rules: [] },
      conditions: [],
    })
    .expect(201);
  ctx.app.get(PricingMaterialsCache).invalidate();
}

function basket(site: string, buyerUserId: string): Record<string, unknown> {
  return {
    buyerUserId,
    fulfillmentMethod: "pickup",
    pickupAddressId: site,
    requestedDeliveryDate: SERVICE_DAY,
    requestedWindow: WINDOW,
    note: "",
    lines: LINES,
  };
}

async function estimate(site: string, buyerUserId: string): Promise<AdminOrderEstimateView> {
  return jsonBody<AdminOrderEstimateView>(
    await staff().post(`${ROUTE}/estimate`).send(basket(site, buyerUserId)).expect(200),
  );
}

async function placeAtCounter(
  site: string,
  buyerUserId: string,
  key: string = freshIntent(),
): Promise<CounterParticularPlacedOrderResponse> {
  const seen = await estimate(site, buyerUserId);
  return jsonBody<CounterParticularPlacedOrderResponse>(
    await staff()
      .post(ROUTE)
      .set(INTENT_KEY, key)
      .send({ ...basket(site, buyerUserId), expectedTotalCents: seen.amounts?.totalCents })
      .expect(201),
  );
}

/** Le même panier, passé par la personne elle-même dans son espace. */
async function placeAsSelf(sub: string, site: string): Promise<number> {
  const id = jsonBody<PlacedOrderResponse>(
    await ctx
      .asSub(sub)
      .post("/orders")
      .send({
        idempotencyKey: freshIntent(),
        salesTerms: null,
        pickupAddressId: site,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        requestedWindow: WINDOW,
        note: "",
        lines: LINES,
      })
      .expect(201),
  ).id;
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id },
    select: { totalCents: true, discountCents: true },
  });
  return row.totalCents;
}

describe("le prix : comme dans son espace", () => {
  it("rend le TTC public que le particulier verrait lui-même, sans la promotion des pros", async () => {
    const { site, particularId } = await scene();
    await proOnlyPromotion(site);

    const atCounter = await placeAtCounter(site, particularId);
    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: atCounter.id },
      select: { totalCents: true, discountCents: true, discountPromotionId: true },
    });
    const bySelf = await placeAsSelf(PARTICULAR_SUB, site);
    const byPro = await ctx.prisma.order.findUniqueOrThrow({
      where: {
        id: jsonBody<PlacedOrderResponse>(
          await ctx
            .asSub(PRO_SUB)
            .post("/orders")
            .send({
              idempotencyKey: freshIntent(),
              salesTerms: null,
              pickupAddressId: site,
              requestedDeliveryDate: SERVICE_DAY,
              fulfillmentMethod: "pickup",
              requestedWindow: WINDOW,
              note: "",
              lines: LINES,
            })
            .expect(201),
        ).id,
      },
      select: { discountCents: true },
    });

    expect(atCounter.totalCents).toBe(bySelf);
    expect(row).toMatchObject({ totalCents: bySelf, discountCents: 0, discountPromotionId: null });
    // La promotion vit bien : le pro, lui, la reçoit.
    expect(byPro.discountCents).toBeGreaterThan(0);
  });
});

describe("la forme de la commande", () => {
  it("écrit une commande publique, au comptoir, not_required et à régler à la caisse", async () => {
    const { site, particularId } = await scene();

    const placed = await placeAtCounter(site, particularId);

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(row).toMatchObject({
      companyId: null,
      clientele: "public",
      entryOrigin: "counter",
      placedByUserId: particularId,
      paymentStatus: "not_required",
      settlementVenue: "shop_till",
      stripePaymentIntentId: null,
      paidAt: null,
      fulfillmentMethod: "pickup",
    });
    expect(row.placedByStaffId).not.toBeNull();
  });

  it("rend la même commande au rejeu de la même clé", async () => {
    const { site, particularId } = await scene();
    const key = freshIntent();

    const first = await placeAtCounter(site, particularId, key);
    const again = await placeAtCounter(site, particularId, key);

    expect(again).toEqual(first);
    expect(await ctx.prisma.order.count({ where: { placedByUserId: particularId } })).toBe(1);
  });

  it("une révision par l'équipe garde not_required et le lieu", async () => {
    const { site, particularId } = await scene();
    const placed = await placeAtCounter(site, particularId);

    await staff()
      .post(`/admin/orders/${placed.id}/revisions`)
      .set(INTENT_KEY, freshIntent())
      .send({
        expectedRevision: 0,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        pickupAddressId: site,
        requestedWindow: WINDOW,
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 2 }],
      })
      .expect(200);

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(row).toMatchObject({
      revision: 1,
      paymentStatus: "not_required",
      settlementVenue: "shop_till",
    });
  });
});

describe("ce qu'elle refuse", () => {
  it("refuse la livraison", async () => {
    const { particularId } = await scene();

    const response = await staff()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({
        buyerUserId: particularId,
        fulfillmentMethod: "delivery",
        deliveryAddress: {
          label: "Maison",
          ligne1: "1 rue des Lilas",
          ligne2: "",
          codePostal: "75011",
          ville: "Paris",
          pays: "France",
        },
        requestedDeliveryDate: SERVICE_DAY,
        requestedWindow: WINDOW,
        note: "",
        lines: LINES,
        expectedTotalCents: 0,
      })
      .expect(400);

    expect(JSON.stringify(response.body)).toContain("orders.shop_till.not_pickup");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("refuse la fiche d'un membre de société", async () => {
    const { site, memberId } = await scene();

    const response = await staff()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({ ...basket(site, memberId), expectedTotalCents: 0 })
      .expect(409);

    expect(JSON.stringify(response.body)).toContain("orders.counter_particular.company_member");
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

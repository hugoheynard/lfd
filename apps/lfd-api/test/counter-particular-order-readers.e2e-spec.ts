/**
 * E2E des **lecteurs du lieu de règlement** d'une commande d'un particulier
 * notée au comptoir, à régler à la caisse de la boutique — plan
 * `documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md`,
 * § 4.2 et § 5.
 *
 * Ce qui ne se prouve qu'ici : la fiche et la liste staff qui disent
 * `shop_till`, le comptoir qui lit le TTC à encaisser et laisse remettre, le
 * CA web qui l'exclut et le suivi à part qui la compte, aucun point de
 * fidélité, et la révision vers une livraison refusée. Jours relatifs
 * (`daysAgo`, `serviceDay`).
 */
import type {
  AdminOrdersPage,
  AdminOrderView,
  AdminOrderEstimateView,
  CounterParticularPlacedOrderResponse,
  CreatedPickupResponse,
  OrderHandoverView,
  ShopTillOrdersReportView,
} from "@lfd/contracts";

import { revenueWhere } from "../src/lafoliecoffee/growth/infrastructure/revenue.where.js";
import { LoyaltySettings } from "../src/lafoliecoffee/loyalty/domain/value-objects/loyalty-settings.js";
import { PrismaLoyaltySettingsStore } from "../src/lafoliecoffee/loyalty/infrastructure/prisma-loyalty-settings.store.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const ROUTE = "/admin/counter/particular-orders";
const PARTICULAR_SUB = "auth0|b4-particulier";
const SERVICE_DAY = serviceDay();
const WINDOW = { start: "07:00", end: "08:00" };
const LINES = [{ sku: "VIE-001-1", quantity: 6 }];

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

/** Un point de retrait, et une commande à régler en boutique d'un particulier qui a un compte. */
async function placedAtCounter(): Promise<{ readonly site: string; readonly orderId: string }> {
  const particular = await createUser(ctx.prisma, { auth0Sub: PARTICULAR_SUB });
  const site = jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .set(INTENT_KEY, freshIntent())
      .send({
        label: "La Boutique",
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
  const basket = {
    buyerUserId: particular.id,
    fulfillmentMethod: "pickup",
    pickupAddressId: site,
    requestedDeliveryDate: SERVICE_DAY,
    requestedWindow: WINDOW,
    note: "",
    lines: LINES,
  };
  const seen = jsonBody<AdminOrderEstimateView>(
    await staff().post(`${ROUTE}/estimate`).send(basket).expect(200),
  );
  const placed = jsonBody<CounterParticularPlacedOrderResponse>(
    await staff()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({ ...basket, expectedTotalCents: seen.amounts?.totalCents })
      .expect(201),
  );
  return { site, orderId: placed.id };
}

describe("ce que l'équipe lit", () => {
  it("la fiche et la liste disent « à régler en boutique », jamais au compte", async () => {
    const { orderId } = await placedAtCounter();

    const detail = jsonBody<AdminOrderView>(
      await staff().get(`/admin/orders/${orderId}`).expect(200),
    );
    const page = jsonBody<AdminOrdersPage>(await staff().get("/admin/orders").expect(200));

    expect(detail.settlement).toBe("shop_till");
    expect(page.rows.find((row) => row.id === orderId)?.settlement).toBe("shop_till");
  });

  it("le comptoir lit le TTC à encaisser sur la caisse, et rien ne l'empêche de remettre", async () => {
    const { orderId } = await placedAtCounter();
    const { totalCents } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { totalCents: true },
    });

    const view = jsonBody<OrderHandoverView>(
      await staff().get(`/admin/handover/order/${orderId}`).expect(200),
    );

    expect(totalCents).toBeGreaterThan(0);
    expect(view.settleAtShopTill).toEqual({ totalCents });
    expect(view.blockedReason ?? "").not.toMatch(/pas réglée/u);
  });
});

describe("le chiffre d'affaires", () => {
  it("le CA web ne la compte pas, le suivi à part la compte en montant commandé", async () => {
    const { orderId } = await placedAtCounter();
    const { totalCents } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { totalCents: true },
    });

    const inWebRevenue = await ctx.prisma.order.count({
      where: { ...revenueWhere(), id: orderId },
    });
    const report = jsonBody<ShopTillOrdersReportView>(
      await staff()
        .get(`/admin/growth/shop-till-orders?from=${SERVICE_DAY}&to=${SERVICE_DAY}`)
        .expect(200),
    );

    expect(inWebRevenue).toBe(0);
    expect(report.rows).toEqual([
      expect.objectContaining({
        day: SERVICE_DAY,
        pickupLabel: "La Boutique",
        orderedTtcCents: totalCents,
        orderedCount: 1,
        handedOverTtcCents: 0,
        handedOverCount: 0,
      }),
    ]);
  });

  it("refuse une période illisible, en le disant", async () => {
    const response = await staff()
      .get(`/admin/growth/shop-till-orders?from=${SERVICE_DAY}&to=2000-01-01`)
      .expect(400);

    expect(JSON.stringify(response.body)).toContain(
      "growth.shop_till_orders_report.invalid_period",
    );
  });
});

describe("la fidélité", () => {
  it("une commande à régler en boutique, remise, ne rapporte aucun point", async () => {
    await ctx.app.get(PrismaLoyaltySettingsStore).write(
      LoyaltySettings.of({
        pointsPerStep: 1_000,
        stepValueCents: 500,
        openToPublic: true,
        openToPro: true,
        voucherValidityDays: 365,
        welcomeBonusPoints: null,
      }),
      new Date(),
      E2E_STAFF_ID,
    );
    const { orderId } = await placedAtCounter();
    // La projection du retrait : remise. Le règlement, lui, reste `not_required`.
    await ctx.prisma.order.update({ where: { id: orderId }, data: { status: "fulfilled" } });

    await ctx
      .http()
      .post("/admin/loyalty/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);

    expect(await ctx.prisma.loyaltyLedgerEntry.count({ where: { orderId } })).toBe(0);
  });
});

describe("la révision", () => {
  it("refuse de la faire passer en livraison, et la laisse intacte", async () => {
    const { orderId } = await placedAtCounter();

    const response = await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .set(INTENT_KEY, freshIntent())
      .send({
        expectedRevision: 0,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddress: {
          label: "Maison",
          ligne1: "1 rue des Lilas",
          ligne2: "",
          codePostal: "75011",
          ville: "Paris",
          pays: "France",
        },
        requestedWindow: WINDOW,
        note: "",
        lines: LINES,
      })
      .expect(400);

    expect(JSON.stringify(response.body)).toContain("orders.revision.shop_till_delivery");
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row).toMatchObject({ revision: 0, fulfillmentMethod: "pickup" });
  });
});

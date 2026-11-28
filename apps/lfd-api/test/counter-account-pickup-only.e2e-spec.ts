/**
 * E2E de **ce que sert un compte ouvert au comptoir** (plan
 * `documentation/comptes-client/plan-comptes-du-comptoir.md`, § 3.7) : le
 * retrait seul. Ce que seul le vrai serveur prouve : la livraison refusée à
 * la passation comme à l'estimation, et le « Retrait immédiat » admis, au
 * compte, par la vraie route.
 *
 * L'acheteur est rattaché par la fabrique : la vraie ouverture n'en crée pas.
 */
import { instantToLocal, localToInstant, type AdminOrderEstimateView } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const CROISSANT = "VIE-001-1";

function todayAt(time: string): Date {
  return localToInstant(instantToLocal(new Date()).day, time) ?? new Date();
}

const clock = new FixedClock(todayAt("12:00"));
let ctx: E2eContext;
let siteId = "";
let day = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: Clock, value: clock }],
  });
});

afterAll(async () => {
  await ctx.close();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

beforeEach(async () => {
  await ctx.reset();
  clock.set(todayAt("12:00"));
  day = instantToLocal(clock.now()).day;
  siteId = await seedShop();
  await staff().patch("/admin/order-cutoff-settings").send({ sameDayProAllowed: true }).expect(204);
});

/** Une boutique ouverte, dix croissants reçus aujourd'hui. */
async function seedShop(): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Boutique du Centre",
      ligne1: "1 place du Centre",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      opening: {
        publicOpening: { start: "07:00", end: "19:00" },
        proPickup: { start: "07:00", end: "19:00" },
      },
    },
    select: { id: true },
  });
  await staff()
    .post(`/admin/resupply-receipts/${site.id}/${day}/lines`)
    .send({ sku: CROISSANT, quantity: 10 })
    .expect(204);
  return site.id;
}

async function openedCounterAccount(sub: string): Promise<{ id: string; buyer: string }> {
  const { id } = jsonBody<{ id: string }>(
    await staff()
      .post("/admin/counter/accounts")
      .set(INTENT_KEY, freshIntent())
      .send({
        enseigne: "Kiosque du Quai",
        contact: {
          firstName: "Camille",
          lastName: "Rousseau",
          email: `${sub}@kiosque.test`,
          phone: "06 12 34 56 78",
        },
        identitySeen: false,
      })
      .expect(201),
  );
  const buyer = await createUser(ctx.prisma, { auth0Sub: sub, email: `${sub}@quai.test` });
  await attachTo(ctx.prisma, buyer.id, id, CustomerRole.owner);
  return { id, buyer: buyer.id };
}

function deliveryBody(account: { readonly id: string; readonly buyer: string }) {
  return {
    companyId: account.id,
    buyerUserId: account.buyer,
    settlement: "account",
    entryOrigin: "counter",
    requestedDeliveryDate: day,
    fulfillmentMethod: "delivery",
    pickupAddressId: null,
    deliveryAddressId: "addr_unknown",
    deliveryAddress: {
      label: "",
      ligne1: "1 rue du Test",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
    },
    requestedWindow: { start: null, end: "10:00" },
    note: "",
    lines: [{ sku: CROISSANT, quantity: 3 }],
  };
}

describe("un compte ouvert au comptoir se sert en retrait seulement", () => {
  it("la livraison est refusée à la passation, et rien n'est écrit", async () => {
    const account = await openedCounterAccount("pickup-only-place");

    const refused = await staff()
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send(deliveryBody(account))
      .expect(409);

    expect(JSON.stringify(refused.body)).toContain("orders.counter.account_pickup_only");
    expect(await ctx.prisma.order.count({ where: { companyId: account.id } })).toBe(0);
  });

  it("l'estimation dit le même refus", async () => {
    const account = await openedCounterAccount("pickup-only-estimate");

    const estimate = jsonBody<AdminOrderEstimateView>(
      await staff().post("/admin/orders/estimate").send(deliveryBody(account)).expect(200),
    );

    expect(estimate.refusal).toMatchObject({ code: "orders.counter.account_pickup_only" });
  });

  it("le « Retrait immédiat » au compte est admis", async () => {
    const account = await openedCounterAccount("pickup-only-immediate");

    await staff()
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send({
        companyId: account.id,
        buyerUserId: account.buyer,
        settlement: "account",
        supply: "shelf",
        entryShortcut: "immediate_pickup",
        requestedDeliveryDate: day,
        fulfillmentMethod: "pickup",
        pickupAddressId: siteId,
        requestedWindow: { start: "12:00", end: "13:00" },
        lines: [{ sku: CROISSANT, quantity: 3 }],
      })
      .expect(201);

    expect(await ctx.prisma.order.count({ where: { companyId: account.id } })).toBe(1);
  });
});

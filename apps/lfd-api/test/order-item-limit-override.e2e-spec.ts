/**
 * E2E du **dépassement de la limite d'un produit** par l'équipe (plan
 * `documentation/limites-de-commande/passer-outre-la-limite-d-un-produit.md`,
 * § 3.5, lot O4).
 *
 * La scène, vraie à toute heure : la règle générale ferme la veille à 00:01
 * pour une journée dans trente jours — encore ouverte ; le levain demande
 * soixante jours de préavis — déjà passé. Deux clés pour passer outre : la
 * case du produit (`order_limit_staff_may_exceed`) et le droit
 * `lfc_product_limit_override`, lu en base à chaque requête.
 */
import { randomUUID } from "node:crypto";

import type {
  AdminOrderEstimateView,
  AdminOrderView,
  BillingAddressPayload,
  StaffAction,
} from "@lfd/contracts";

import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  E2E_STAFF_SUB,
  bootstrapE2e,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const MEMBER = "auth0|membre-levain";
/** Un administrateur à qui l'on a retiré le droit d'écrire. */
const WITHOUT_RIGHT = "staff-sans-depassement";
/** Un administrateur à qui l'on a retiré le droit de lire (donc d'écrire). */
const BLIND = "staff-sans-lecture";
const SKU = "VIE-001-1";

const LABO: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const fakeGateway = cardGatewayDouble("pi_ovr");

/** Le jeton porteur EST le `sub` : chaque membre de l'équipe se nomme par le sien. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let pickupId = "";
let companyId = "";
let buyerUserId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: CardProviders, value: fakeGateway },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  pickupId = (await ctx.prisma.site.create({ data: { ...LABO, isDefault: true } })).id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER, email: "levain@test.fr" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  companyId = company.id;
  buyerUserId = member.id;
  // La règle générale : la veille à 00:01 — ouverte pour une journée dans 30 jours.
  await ctx.prisma.orderCutoff.create({
    data: { pickupAddressId: null, weekday: null, daysBefore: 1, time: "00:01", graceMinutes: 0 },
  });
  await staffDeniedOn(WITHOUT_RIGHT, "write");
  await staffDeniedOn(BLIND, "read");
});

/** La limite du levain, 60 jours avant, telle que le fil la dépose, case comprise. */
async function seedLimit(staffMayExceed: boolean): Promise<void> {
  await ctx.prisma.catalogItem.update({
    where: { sku: SKU },
    data: {
      orderLimitDaysBefore: 60,
      orderLimitTime: "23:59",
      orderLimitGraceMinutes: 0,
      orderLimitStaffMayExceed: staffMayExceed,
    },
  });
}

/** Un administrateur dont on refuse une action sur le droit de passer outre. */
async function staffDeniedOn(sub: string, action: StaffAction): Promise<void> {
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "admin",
      status: "active",
      auth0Id: sub,
    },
  });
  await ctx.prisma.staffPermissionOverride.create({
    data: { staffUserId: row.id, resource: "lfc_product_limit_override", action, effect: "deny" },
  });
}

const DAY = serviceDay(30);

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    companyId,
    buyerUserId,
    settlement: "link",
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    deliveryAddress: null,
    deliveryAddressId: null,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: SKU, quantity: 2 }],
    ...over,
  };
}

function place(sub: string, over: Record<string, unknown> = {}) {
  return ctx.asSub(sub).post("/admin/orders").set(INTENT_KEY, freshIntent()).send(body(over));
}

async function written(): Promise<readonly number[]> {
  return Promise.all([
    ctx.prisma.order.count(),
    ctx.prisma.cardPayment.count(),
    ctx.prisma.orderItemLimitOverride.count(),
  ]);
}

describe("la saisie de l'équipe passe outre la limite d'un produit qui le permet", () => {
  it("refuse sans le droit, comme toute limite passée", async () => {
    await seedLimit(true);

    const response = await place(WITHOUT_RIGHT, { itemLimitOverrideReason: "Salon" }).expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await written()).toEqual([0, 0, 0]);
  });

  it("avec le droit sans motif : refuse en nommant le produit, sans commande ni lien", async () => {
    await seedLimit(true);

    const response = await place(E2E_STAFF_SUB).expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.item_limit_reason_required" });
    expect(jsonBody<{ message: string }>(response).message).toContain(
      "se commande 60 jours avant, 23 h 59",
    );
    expect(await written()).toEqual([0, 0, 0]);
  });

  it("après le refus, la même clé repasse avec un motif : la clé a été rendue", async () => {
    await seedLimit(true);
    const key = freshIntent();
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders")
      .set(INTENT_KEY, key)
      .send(body())
      .expect(409);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders")
      .set(INTENT_KEY, key)
      .send(body({ itemLimitOverrideReason: "Salon du client" }))
      .expect(201);
  });

  it("avec le droit et un motif : passe la commande et consigne une ligne de trace", async () => {
    await seedLimit(true);

    const response = await place(E2E_STAFF_SUB, {
      itemLimitOverrideReason: "  Le client l'a demandé au salon  ",
    }).expect(201);

    const orderId = jsonBody<{ id: string }>(response).id;
    const staff = await ctx.prisma.staffUser.findFirstOrThrow({
      where: { auth0Id: E2E_STAFF_SUB },
      select: { id: true },
    });
    const traces = await ctx.prisma.orderItemLimitOverride.findMany({ where: { orderId } });
    expect(traces).toEqual([
      expect.objectContaining({
        sku: SKU,
        staffUserId: staff.id,
        reason: "Le client l'a demandé au salon",
        daysBefore: 60,
        time: "23:59",
        origin: "placement",
        serviceDay: new Date(`${DAY}T00:00:00.000Z`),
      }),
    ]);
  });

  it("refuse un produit dont la case n'est pas cochée, même avec le droit et un motif", async () => {
    await seedLimit(false);

    const response = await place(E2E_STAFF_SUB, { itemLimitOverrideReason: "Salon" }).expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await written()).toEqual([0, 0, 0]);
  });

  it("refuse en 400 un motif de plus de 280 caractères", async () => {
    await seedLimit(true);
    await place(E2E_STAFF_SUB, { itemLimitOverrideReason: "x".repeat(281) }).expect(400);
  });
});

describe("le client et la boutique ne passent jamais outre", () => {
  it("refuse le client connecté", async () => {
    await seedLimit(true);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send({
        companyId,
        idempotencyKey: randomUUID(),
        salesTerms: null,
        pickupAddressId: pickupId,
        fulfillmentMethod: "pickup",
        requestedWindow: { start: "07:00", end: "08:00" },
        requestedDeliveryDate: DAY,
        note: "",
        lines: [{ sku: SKU, quantity: 2 }],
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
  });

  it("refuse la boutique sans compte", async () => {
    await seedLimit(true);

    const response = await ctx
      .http()
      .post("/shop/orders")
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
        fulfillmentMethod: "pickup",
        requestedWindow: { start: "07:00", end: "08:00" },
        deliveryAddress: null,
        deliveryAddressId: null,
        pickupAddressId: pickupId,
        requestedDeliveryDate: DAY,
        note: "",
        lines: [{ sku: SKU, quantity: 2 }],
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await written()).toEqual([0, 0, 0]);
  });
});

describe("l'estimation annonce le dépassement sans exiger le motif", () => {
  async function estimate(sub: string): Promise<AdminOrderEstimateView> {
    const response = await ctx.asSub(sub).post("/admin/orders/estimate").send(body()).expect(200);
    return jsonBody<AdminOrderEstimateView>(response);
  }

  it("avec le droit : les montants, et la limite passée", async () => {
    await seedLimit(true);

    const view = await estimate(E2E_STAFF_SUB);

    expect(view.refusal).toBeNull();
    expect(view.amounts?.totalCents).toBeGreaterThan(0);
    expect(view.cutoff).toMatchObject({
      status: "open",
      exceeded: [{ sku: SKU, daysBefore: 60, time: "23:59" }],
      closedByItemLimit: [{ sku: SKU, exceedable: true }],
    });
    expect(await written()).toEqual([0, 0, 0]);
  });

  it("sans le droit : le refus, et la ligne dite non dépassable", async () => {
    await seedLimit(true);

    const view = await estimate(WITHOUT_RIGHT);

    expect(view.refusal?.code).toBe("orders.cutoff.past");
    expect(view.cutoff).toMatchObject({
      status: "closed",
      exceeded: [],
      closedByItemLimit: [{ sku: SKU, exceedable: false }],
    });
  });
});

describe("la vue d'une commande au back-office", () => {
  async function placedOverride(): Promise<string> {
    await seedLimit(true);
    const response = await place(E2E_STAFF_SUB, { itemLimitOverrideReason: "Salon" }).expect(201);
    return jsonBody<{ id: string }>(response).id;
  }

  it("rend les dépassements consignés à qui a le droit de les lire", async () => {
    const orderId = await placedOverride();

    const view = jsonBody<AdminOrderView>(
      await ctx.asSub(WITHOUT_RIGHT).get(`/admin/orders/${orderId}`).expect(200),
    );

    expect(view.itemLimitOverrides).toEqual([
      expect.objectContaining({ sku: SKU, reason: "Salon", origin: "placement", daysBefore: 60 }),
    ]);
  });

  it("ne les rend pas sans le droit de lecture", async () => {
    const orderId = await placedOverride();

    const view = jsonBody<AdminOrderView>(
      await ctx.asSub(BLIND).get(`/admin/orders/${orderId}`).expect(200),
    );

    expect("itemLimitOverrides" in view).toBe(false);
  });
});

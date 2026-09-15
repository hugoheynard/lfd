/**
 * E2E de la **clientèle** d'une requête, au devis comme à la commande (plan
 * `remise-et-livraison-par-clientele`, D1, D3, D5 ; Q1 et Q3).
 *
 * B2B = une société ACTIVE agit ; B2C = un visiteur, l'espace perso, ou une
 * société qui n'est pas active. Ce que seul le vrai chemin prouve : que la
 * clientèle est DÉDUITE au serveur, du statut lu en base, par les trois portes
 * — le devis anonyme, le devis reconnu, et `POST /orders` — et que la commande
 * saisie par l'équipe suit la même règle.
 *
 * Réglages posés par les routes staff, pas par Prisma : ce sont elles que le
 * back-office appelle, et elles passent par `PickupDiscount`.
 */
import { randomUUID } from "node:crypto";

import type { CreatedPickupResponse, PlacedOrderResponse, ShopQuoteView } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const SERVICE_DAY = serviceDay();
const PERSO = "auth0|perso";
const PENDING = "auth0|en-attente";
const ACTIVE = "auth0|active";
const CLOSED_FOR_AUDIENCE = "orders.delivery.closed_for_audience";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_audience_${intentCounter}`,
      clientSecret: `pi_audience_${intentCounter}_secret`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Les trois personnes : sans société, dans une société en attente, dans une société active. */
async function seedPeople(): Promise<{
  readonly activeCompanyId: string;
  readonly activeBuyerId: string;
}> {
  await createUser(ctx.prisma, { auth0Sub: PERSO });
  const pending = await createUser(ctx.prisma, { auth0Sub: PENDING });
  const pendingCompany = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
  await attachTo(ctx.prisma, pending.id, pendingCompany.id, CustomerRole.owner);
  const active = await createUser(ctx.prisma, { auth0Sub: ACTIVE });
  const activeCompany = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, active.id, activeCompany.id, CustomerRole.owner);
  return { activeCompanyId: activeCompany.id, activeBuyerId: active.id };
}

/** Un point qui remet 10 %, aux PROS seulement. */
async function seedProsOnlyPoint(): Promise<string> {
  const response = await staff()
    .post("/admin/pickup-addresses")
    .send({
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
      discount: { mode: "percent", bp: 1_000 },
      discountAudiences: { b2b: true, b2c: false },
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function seedZone(): Promise<void> {
  await staff()
    .post("/admin/delivery-zones")
    .send({
      label: "Val d'Isère",
      postalPrefixes: ["73150"],
      fee: { mode: "amount", cents: 2_000 },
    })
    .expect(201);
}

const LINES = [{ sku: "VIE-001", quantity: 10 }];
const COURIER_ADDR = {
  label: "",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

function pickupQuote(pickupAddressId: string): Record<string, unknown> {
  return { lines: LINES, fulfillment: { method: "pickup", pickupAddressId } };
}

const DELIVERY_QUOTE = { lines: LINES, fulfillment: { method: "delivery", codePostal: "73150" } };

function pickupOrder(pickupAddressId: string): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    pickupAddressId,
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    note: "",
    lines: LINES,
  };
}

function deliveryOrder(): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "delivery",
    deliveryAddress: COURIER_ADDR,
    note: "",
    lines: LINES,
  };
}

async function quoteMine(sub: string, body: Record<string, unknown>): Promise<ShopQuoteView> {
  return jsonBody<ShopQuoteView>(
    await ctx.asSub(sub).post("/shop/quote/mine").send(body).expect(200),
  );
}

async function orderDiscount(sub: string, body: Record<string, unknown>): Promise<number> {
  const placed = jsonBody<PlacedOrderResponse>(
    await ctx.asSub(sub).post("/orders").send(body).expect(201),
  );
  const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
  return row.discountCents;
}

describe("une remise réservée aux pros", () => {
  it("au DEVIS : absente pour un visiteur, en perso et pour une société en attente ; appliquée pour une société active", async () => {
    await seedPeople();
    const point = await seedProsOnlyPoint();

    const visitor = jsonBody<ShopQuoteView>(
      await ctx.http().post("/shop/quote").send(pickupQuote(point)).expect(200),
    );
    expect(visitor.discountCents).toBe(0);
    expect(visitor.discountAdjustment).toBeNull();

    expect((await quoteMine(PERSO, pickupQuote(point))).discountCents).toBe(0);
    // Q3 : déclarer une société ne suffit pas à être pro.
    expect((await quoteMine(PENDING, pickupQuote(point))).discountCents).toBe(0);

    const pro = await quoteMine(ACTIVE, pickupQuote(point));
    expect(pro.discountCents).toBe(Math.round(pro.subtotalHtCents / 10));
    expect(pro.discountCents).toBeGreaterThan(0);
    expect(pro.discountAdjustment).toEqual({ mode: "percent", bp: 1_000 });
  });

  it("à la COMMANDE : figée à zéro en perso et pour une société en attente ; appliquée pour une société active", async () => {
    await seedPeople();
    const point = await seedProsOnlyPoint();

    expect(await orderDiscount(PERSO, pickupOrder(point))).toBe(0);
    expect(await orderDiscount(PENDING, pickupOrder(point))).toBe(0);
    expect(await orderDiscount(ACTIVE, pickupOrder(point))).toBeGreaterThan(0);
  });
});

describe("la livraison fermée à une clientèle", () => {
  it("ligne absente : ouverte aux particuliers, au devis anonyme", async () => {
    await seedZone();

    const view = jsonBody<ShopQuoteView>(
      await ctx.http().post("/shop/quote").send(DELIVERY_QUOTE).expect(200),
    );
    expect(view.deliveryFeeCents).toBe(2_000);
  });

  it("fermée aux particuliers : 409 au devis ET à la commande, ouverte à une société active", async () => {
    await seedPeople();
    await seedZone();
    await staff().patch("/admin/delivery-availability").send({ openToB2c: false }).expect(204);

    const anonymous = await ctx.http().post("/shop/quote").send(DELIVERY_QUOTE).expect(409);
    expect((anonymous.body as { code?: string }).code).toBe(CLOSED_FOR_AUDIENCE);

    const perso = await ctx.asSub(PERSO).post("/orders").send(deliveryOrder()).expect(409);
    expect((perso.body as { code?: string }).code).toBe(CLOSED_FOR_AUDIENCE);
    const pending = await ctx.asSub(PENDING).post("/orders").send(deliveryOrder()).expect(409);
    expect((pending.body as { code?: string }).code).toBe(CLOSED_FOR_AUDIENCE);
    expect(await ctx.prisma.order.count()).toBe(0);

    expect((await quoteMine(ACTIVE, DELIVERY_QUOTE)).deliveryFeeCents).toBe(2_000);
    await ctx.asSub(ACTIVE).post("/orders").send(deliveryOrder()).expect(201);
  });

  /** Q1 (Hugo, 2026-09-15) : le staff ne livre pas quand la livraison est fermée au B2B. */
  it("fermée aux pros : la commande saisie par l'équipe pour une société active est refusée (409)", async () => {
    const { activeCompanyId, activeBuyerId } = await seedPeople();
    await seedZone();
    await staff().patch("/admin/delivery-availability").send({ openToB2b: false }).expect(204);

    const response = await staff()
      .post("/admin/orders")
      .send({
        companyId: activeCompanyId,
        buyerUserId: activeBuyerId,
        settlement: "link",
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        pickupAddressId: null,
        deliveryAddress: COURIER_ADDR,
        note: "",
        lines: LINES,
      })
      .expect(409);

    expect((response.body as { code?: string }).code).toBe(CLOSED_FOR_AUDIENCE);
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

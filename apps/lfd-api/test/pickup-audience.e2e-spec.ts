/**
 * E2E du **retrait par clientèle** (Hugo, 2026-10-15) : un site peut être
 * réservé au retrait des pros ou des particuliers, réglé à l'écran du site.
 *
 * Ce que seul le vrai chemin prouve : que la règle tient sur les TROIS
 * passations — `POST /orders` (client reconnu), `POST /shop/orders` (sans
 * compte) et `POST /admin/orders` (l'équipe, sans exception) — et au devis,
 * avec la clientèle DÉDUITE en base (société active ⇒ pro, en attente ⇒
 * particulier) ; et qu'un site d'avant les cases reste ouvert aux deux.
 *
 * Réglages posés par les routes staff, comme le back-office.
 */
import { randomUUID } from "node:crypto";

import {
  type CreatedPickupResponse,
  PICKUP_CLOSED_FOR_AUDIENCE,
  type PickupAddressView,
  type PickupDiscountAudiences,
} from "@lfd/contracts";

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
const PERSO = "auth0|retrait-perso";
const PENDING = "auth0|retrait-en-attente";
const ACTIVE = "auth0|retrait-active";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_pickup_audience_${intentCounter}`,
      clientSecret: `pi_pickup_audience_${intentCounter}_secret`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
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

interface People {
  readonly activeCompanyId: string;
  readonly activeBuyerId: string;
  readonly pendingCompanyId: string;
  readonly pendingBuyerId: string;
}

/** Sans société, dans une société en attente, dans une société active. */
async function seedPeople(): Promise<People> {
  await createUser(ctx.prisma, { auth0Sub: PERSO });
  const pending = await createUser(ctx.prisma, { auth0Sub: PENDING });
  const pendingCompany = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
  await attachTo(ctx.prisma, pending.id, pendingCompany.id, CustomerRole.owner);
  const active = await createUser(ctx.prisma, { auth0Sub: ACTIVE });
  const activeCompany = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, active.id, activeCompany.id, CustomerRole.owner);
  return {
    activeCompanyId: activeCompany.id,
    activeBuyerId: active.id,
    pendingCompanyId: pendingCompany.id,
    pendingBuyerId: pending.id,
  };
}

/** Un site, créé comme le back-office le crée : ouvert aux deux. */
async function seedSite(): Promise<string> {
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
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

/** Les rôles du site, en bloc, avec ses clientèles du retrait. */
function reserve(siteId: string, pickupAudiences: PickupDiscountAudiences) {
  return staff().put(`/admin/sites/${siteId}/roles`).send({
    pickup: true,
    supply: "on_site",
    deliveryDeparture: false,
    transferMode: "integrated",
    counterSetupMinutes: 0,
    pickupAudiences,
  });
}

const LINES = [{ sku: "VIE-001", quantity: 10 }];
const WINDOW = { start: "07:00", end: "08:00" };

function quote(siteId: string): Record<string, unknown> {
  return { lines: LINES, fulfillment: { method: "pickup", pickupAddressId: siteId } };
}

function order(siteId: string): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    pickupAddressId: siteId,
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    requestedWindow: WINDOW,
    note: "",
    lines: LINES,
  };
}

function guestOrder(siteId: string): Record<string, unknown> {
  return {
    ...order(siteId),
    buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
    deliveryAddress: null,
    deliveryAddressId: null,
  };
}

function staffOrder(siteId: string, companyId: string, buyerUserId: string) {
  return staff().post("/admin/orders").send({
    companyId,
    buyerUserId,
    settlement: "link",
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    requestedWindow: WINDOW,
    pickupAddressId: siteId,
    deliveryAddress: null,
    note: "",
    lines: LINES,
  });
}

/** Le code et le message d'un refus. */
function refusal(body: unknown): { readonly code?: string; readonly message?: string } {
  return body as { readonly code?: string; readonly message?: string };
}

describe("un site d'avant les cases", () => {
  it("est servi ouvert aux deux, et chaque clientèle y retire", async () => {
    await seedPeople();
    const site = await seedSite();

    const listed = jsonBody<readonly PickupAddressView[]>(
      await ctx.http().get("/pickup-addresses").expect(200),
    );
    expect(listed[0]?.pickupAudiences).toEqual({ b2b: true, b2c: true });

    await ctx.http().post("/shop/quote").send(quote(site)).expect(200);
    await ctx.asSub(ACTIVE).post("/orders").send(order(site)).expect(201);
    await ctx.asSub(PERSO).post("/orders").send(order(site)).expect(201);
  });
});

describe("un site réservé aux particuliers", () => {
  it("refuse un pro au devis et à la commande, en nommant le site et le geste", async () => {
    await seedPeople();
    const site = await seedSite();
    await reserve(site, { b2b: false, b2c: true }).expect(204);

    const quoted = await ctx.asSub(ACTIVE).post("/shop/quote/mine").send(quote(site)).expect(409);
    expect(refusal(quoted.body).code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);

    const placed = await ctx.asSub(ACTIVE).post("/orders").send(order(site)).expect(409);
    expect(refusal(placed.body).code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);
    expect(refusal(placed.body).message).toContain("« Labo »");
    expect(refusal(placed.body).message).toContain("aux professionnels");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  /** « Même règle équipe » (Hugo, 2026-10-15). */
  it("refuse aussi la commande saisie par l'équipe pour une société active", async () => {
    const people = await seedPeople();
    const site = await seedSite();
    await reserve(site, { b2b: false, b2c: true }).expect(204);

    const response = await staffOrder(site, people.activeCompanyId, people.activeBuyerId).expect(
      409,
    );

    expect(refusal(response.body).code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("sert un visiteur, un perso et une société en attente", async () => {
    await seedPeople();
    const site = await seedSite();
    await reserve(site, { b2b: false, b2c: true }).expect(204);

    await ctx.http().post("/shop/quote").send(quote(site)).expect(200);
    await ctx.asSub(PERSO).post("/orders").send(order(site)).expect(201);
    await ctx.asSub(PENDING).post("/orders").send(order(site)).expect(201);
  });
});

describe("un site réservé aux pros", () => {
  it("refuse un visiteur au devis et à la commande sans compte", async () => {
    const site = await seedSite();
    await reserve(site, { b2b: true, b2c: false }).expect(204);

    const quoted = await ctx.http().post("/shop/quote").send(quote(site)).expect(409);
    expect(refusal(quoted.body).code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);

    const placed = await ctx.http().post("/shop/orders").send(guestOrder(site)).expect(409);
    expect(refusal(placed.body).code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);
    expect(refusal(placed.body).message).toContain("aux particuliers");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  /** Q3 du plan de la clientèle : une société en attente suit les règles des particuliers. */
  it("traite une société EN ATTENTE en particulier — elle, et l'équipe pour elle", async () => {
    const people = await seedPeople();
    const site = await seedSite();
    await reserve(site, { b2b: true, b2c: false }).expect(204);

    const perso = await ctx.asSub(PERSO).post("/orders").send(order(site)).expect(409);
    expect(refusal(perso.body).code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);
    const pending = await ctx.asSub(PENDING).post("/orders").send(order(site)).expect(409);
    expect(refusal(pending.body).code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);
    const byStaff = await staffOrder(site, people.pendingCompanyId, people.pendingBuyerId).expect(
      409,
    );
    expect(refusal(byStaff.body).code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);
    expect(await ctx.prisma.order.count()).toBe(0);

    await ctx.asSub(ACTIVE).post("/orders").send(order(site)).expect(201);
    await staffOrder(site, people.activeCompanyId, people.activeBuyerId).expect(201);
  });
});

describe("le réglage du site", () => {
  it("refuse un retrait ouvert à personne, et garde ce qui était enregistré", async () => {
    const site = await seedSite();

    const response = await reserve(site, { b2b: false, b2c: false }).expect(400);

    expect(refusal(response.body).code).toBe("site.roles.pickup_without_audience");
    const row = await ctx.prisma.site.findUniqueOrThrow({ where: { id: site } });
    expect({ b2b: row.pickupForB2b, b2c: row.pickupForB2c }).toEqual({ b2b: true, b2c: true });
  });

  it("garde les cases quand un écran d'avant ne les envoie pas (absent = inchangé)", async () => {
    const site = await seedSite();
    await reserve(site, { b2b: true, b2c: false }).expect(204);

    await staff()
      .put(`/admin/sites/${site}/roles`)
      .send({
        pickup: true,
        supply: "on_site",
        deliveryDeparture: false,
        transferMode: "integrated",
        counterSetupMinutes: 5,
      })
      .expect(204);

    const view = jsonBody<{ pickupAudiences: PickupDiscountAudiences }>(
      await staff().get(`/admin/sites/${site}`).expect(200),
    );
    expect(view.pickupAudiences).toEqual({ b2b: true, b2c: false });
  });
});

/**
 * E2E des **gardes de la boutique** — plan
 * `documentation/b2b/plan-inscription-pro-seule.md`, lot 3.
 *
 * Ce que seul le module entier prouve :
 * - l'ordre réel des gardes globales de `AppModule` : la garde de la boutique
 *   voit le `Principal` résolu en base, donc l'exemption ;
 * - la preuve d'adresse lue dans la vraie table des personnes ;
 * - la surface staff et les commandes existantes ne sont jamais coupées ;
 * - `GET /feature-access/mine` ne révèle rien de la liste.
 *
 * Le niveau se pose par les routes admin du lot 1, jamais en base : c'est le
 * geste du runbook qu'on éprouve. Deux frontières doublées : la signature du
 * jeton staff et la passerelle Stripe.
 */
import { randomUUID } from "node:crypto";

import type {
  AdminPlacedOrderResponse,
  CustomerOrderView,
  FeatureLevelsView,
  PlacedOrderResponse,
  ShopLevel,
} from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** Toutes les clés sauf la boutique, à leur défaut : le mandat client est fermé (2026-09-14). */
const OTHER_DEFAULTS = {
  orders: "visible",
  invoices: "visible",
  desktopMenu: "visible",
  customerMandate: "closed",
} as const;

const CLIENT = "auth0|client";
const TESTER = "auth0|testeur";
const TESTER_EMAIL = "testeur@exemple.fr";
const SERVICE_DAY = serviceDay();

const SHOP_CLOSED = "La boutique n'est pas encore ouverte.";
const ORDERS_CLOSED = "Les commandes en ligne ne sont pas encore ouvertes.";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** L'intention change à chaque appel : la colonne est `@unique`. */
let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_guard_${String(intentCounter)}`,
      clientSecret: `pi_guard_${String(intentCounter)}_secret`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;
let pickupId = "pickup_absent";

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
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

// Retour au défaut du code après chaque cas, par le geste admin : aucun test ne
// dépend du niveau laissé par le précédent. `404` = déjà au défaut.
afterEach(async () => {
  const answer = await admin().delete("/admin/feature-access/shop");
  expect([204, 404]).toContain(answer.status);
});

const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function setShop(level: ShopLevel): Promise<void> {
  await admin().put("/admin/feature-access/shop").send({ value: level }).expect(204);
}

async function exempt(email: string): Promise<void> {
  await admin().post("/admin/feature-access/shop/exemptions").send({ email }).expect(201);
}

function personalOrder(): Record<string, unknown> {
  return {
    companyId: null,
    idempotencyKey: randomUUID(),
    pickupAddressId: pickupId,
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    note: "",
    lines: [{ sku: "VIE-001", quantity: 3 }],
  };
}

describe("boutique fermée", () => {
  it("ferme aussi la vitrine PUBLIQUE, et le panier du client connecté", async () => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });
    await setShop("closed");

    const refused = await ctx.http().get("/shop/catalogue").expect(409);
    expect(refused.body).toMatchObject({ message: SHOP_CLOSED });
    await ctx.http().post("/shop/quote").send({ lines: [] }).expect(409);
    await ctx.asSub(CLIENT).get("/shop/cart").expect(409);
  });

  it("laisse lire une commande passée avant la fermeture", async () => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });
    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(CLIENT).post("/orders").send(personalOrder()).expect(201),
    );
    await setShop("closed");

    const mine = jsonBody<readonly CustomerOrderView[]>(
      await ctx.asSub(CLIENT).get("/orders/mine").expect(200),
    );
    expect(mine.map((order) => order.orderNumber)).toEqual([placed.orderNumber]);
    await ctx.asSub(CLIENT).get(`/orders/${placed.id}`).expect(200);
  });
});

describe("boutique en vitrine", () => {
  it("sert la vitrine et refuse la commande, sans rien écrire", async () => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });
    await setShop("browse");

    await ctx.http().get("/shop/catalogue").expect(200);
    await ctx.asSub(CLIENT).get("/shop/catalogue/mine").expect(200);
    const refused = await ctx.asSub(CLIENT).post("/orders").send(personalOrder()).expect(409);

    expect(refused.body).toMatchObject({ message: ORDERS_CLOSED });
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

describe("boutique ouverte à la commande", () => {
  it("laisse commander au niveau `order` posé explicitement", async () => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });
    await setShop("order");

    await ctx.asSub(CLIENT).post("/orders").send(personalOrder()).expect(201);
  });
});

describe("l'exemption par adresse", () => {
  it("laisse commander, boutique fermée, une adresse exemptée ET prouvée", async () => {
    await createUser(ctx.prisma, { auth0Sub: TESTER, email: TESTER_EMAIL, emailVerified: true });
    await exempt(TESTER_EMAIL);
    await setShop("closed");

    await ctx.asSub(TESTER).post("/orders").send(personalOrder()).expect(201);
  });

  it("refuse la même adresse NON prouvée — s'inscrire sous l'e-mail d'un testeur n'ouvre rien", async () => {
    await createUser(ctx.prisma, { auth0Sub: TESTER, email: TESTER_EMAIL, emailVerified: false });
    await exempt(TESTER_EMAIL);
    await setShop("closed");

    await ctx.asSub(TESTER).post("/orders").send(personalOrder()).expect(409);
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

describe("GET /feature-access/mine", () => {
  it("rend `order` à l'exempté prouvé, `closed` aux autres, et rien de plus", async () => {
    await createUser(ctx.prisma, { auth0Sub: TESTER, email: TESTER_EMAIL, emailVerified: true });
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });
    await exempt(TESTER_EMAIL);
    await setShop("closed");

    const tester = await ctx.asSub(TESTER).get("/feature-access/mine").expect(200);
    const client = await ctx.asSub(CLIENT).get("/feature-access/mine").expect(200);

    expect(jsonBody<FeatureLevelsView>(tester)).toEqual({ shop: "order", ...OTHER_DEFAULTS });
    expect(tester.text).not.toMatch(/exempt|@/i);
    expect(jsonBody<FeatureLevelsView>(client)).toEqual({ shop: "closed", ...OTHER_DEFAULTS });
  });

  it("exige une personne connectée", async () => {
    await ctx.http().get("/feature-access/mine").expect(401);
  });
});

describe("POST /admin/orders — jamais coupée", () => {
  async function seedBuyer(): Promise<{ readonly companyId: string; readonly buyerId: string }> {
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
    const buyer = await createUser(ctx.prisma, { auth0Sub: CLIENT, email: "acheteur@test.fr" });
    await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
    return { companyId: company.id, buyerId: buyer.id };
  }

  it.each<ShopLevel>(["closed", "browse", "order"])(
    "passe la commande saisie par l'équipe au niveau %s",
    async (level) => {
      const { companyId, buyerId } = await seedBuyer();
      await setShop(level);

      const placed = jsonBody<AdminPlacedOrderResponse>(
        await admin()
          .post("/admin/orders")
          .send({
            companyId,
            buyerUserId: buyerId,
            settlement: "account",
            requestedDeliveryDate: SERVICE_DAY,
            fulfillmentMethod: "pickup",
            pickupAddressId: pickupId,
            requestedWindow: { start: "07:00", end: "08:00" },
            lines: [{ sku: "VIE-001", quantity: 12 }],
          })
          .expect(201),
      );

      expect(placed.id).toEqual(expect.any(String));
    },
  );
});

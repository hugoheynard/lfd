import { randomUUID } from "node:crypto";

import type { CatalogItemView } from "@lfd/contracts";
import request from "supertest";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite } from "./order-factory.js";

/**
 * E2E — **la quantité minimale d'achat, refusée partout en dessous**
 * (`documentation/catalogue/plan-quantite-minimale.md`, M4, Q5, Q6).
 *
 * Ce que seul ce niveau prouve : le minimum projeté dans `catalog_items` est
 * celui que la passation et le devis lisent, chacun pour SA clientèle — le pro
 * contre `pro_min_quantity`, le particulier contre `public_min_quantity` —, et
 * l'équipe n'y échappe pas. Un refus est un 409 qui n'écrit rien.
 */

const PRO = "auth0|pro-minimum";
const PERSO = "auth0|perso-minimum";
const SERVICE_DAY = serviceDay();
/** Le croissant : par 6 au moins pour un pro, par 4 pour un particulier. */
const PRO_MINIMUM = 6;
const PUBLIC_MINIMUM = 4;
const BELOW_MINIMUM = "orders.line.quantity_below_minimum";

const fakeGateway = {
  createIntent: () => {
    const id = `pi_minimum_${randomUUID()}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;
let companyId = "";
let buyerId = "";
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: PaymentGateway, value: fakeGateway }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: PERSO });
  const buyer = await createUser(ctx.prisma, { auth0Sub: PRO });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  companyId = company.id;
  buyerId = buyer.id;
  pickupId = await pickupSite(ctx.prisma);
  // Le minimum tel que le fil v15 le projette sur la déclinaison par défaut.
  await ctx.prisma.catalogItem.update({
    where: { sku: "VIE-001-1" },
    data: { proMinQuantity: PRO_MINIMUM, publicMinQuantity: PUBLIC_MINIMUM },
  });
});

function content(quantity: number): Record<string, unknown> {
  return {
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    pickupAddressId: pickupId,
    requestedDeliveryDate: SERVICE_DAY,
    note: "",
    lines: [{ sku: "VIE-001", quantity }],
  };
}

function basket(quantity: number, company: string | null): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    companyId: company,
    ...content(quantity),
  };
}

function staffOrder(quantity: number): Record<string, unknown> {
  return { companyId, buyerUserId: buyerId, settlement: "link", ...content(quantity) };
}

async function expectRefused(response: request.Response): Promise<void> {
  expect(response.status).toBe(409);
  expect(jsonBody<{ code: string }>(response).code).toBe(BELOW_MINIMUM);
  expect(await ctx.prisma.order.count()).toBe(0);
}

describe("la passation en ligne", () => {
  it("un pro sous SON minimum : 409, rien d'écrit — même au minimum public", async () => {
    await expectRefused(
      await ctx.asSub(PRO).post("/orders").send(basket(PUBLIC_MINIMUM, companyId)),
    );
  });

  it("un pro au minimum : la commande passe", async () => {
    await ctx.asSub(PRO).post("/orders").send(basket(PRO_MINIMUM, companyId)).expect(201);
  });

  it("un particulier sous son minimum : 409, et le message nomme le geste", async () => {
    const response = await ctx
      .asSub(PERSO)
      .post("/orders")
      .send(basket(PUBLIC_MINIMUM - 1, null));

    await expectRefused(response);
    expect(jsonBody<{ message: string }>(response).message).toContain(
      `Commandez au moins ${String(PUBLIC_MINIMUM)} pièces`,
    );
  });

  it("un particulier à son minimum : passe, sans le minimum pro", async () => {
    await ctx.asSub(PERSO).post("/orders").send(basket(PUBLIC_MINIMUM, null)).expect(201);
  });
});

describe("le devis de la boutique refuse avant la passation", () => {
  const quote = (quantity: number) =>
    request(ctx.app.getHttpServer())
      .post("/shop/quote")
      .send({ lines: [{ sku: "VIE-001", quantity }], fulfillment: null });

  it("sous le minimum public : 409", async () => {
    await expectRefused(await quote(PUBLIC_MINIMUM - 1));
  });

  it("au minimum public : chiffré", async () => {
    await quote(PUBLIC_MINIMUM).expect(200);
  });
});

describe("la commande saisie par l'équipe (nouvelle commande pro, comptoir)", () => {
  const staff = () => ctx.asSub(E2E_STAFF_SUB);

  it("le catalogue de saisie sert le minimum PRO", async () => {
    const items = jsonBody<readonly CatalogItemView[]>(
      await staff().get("/admin/catalog/sellable").expect(200),
    );

    expect(items.find((item) => item.sku === "VIE-001")?.minQuantity).toBe(PRO_MINIMUM);
  });

  it("sous le minimum pro : 409, l'équipe n'y échappe pas", async () => {
    await expectRefused(
      await staff()
        .post("/admin/orders")
        .send(staffOrder(PRO_MINIMUM - 1)),
    );
  });

  it("au minimum pro : la commande passe", async () => {
    await staff().post("/admin/orders").send(staffOrder(PRO_MINIMUM)).expect(201);
  });
});

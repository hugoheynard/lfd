import { randomUUID } from "node:crypto";
/**
 * E2E de **l'alias à l'entrée** — `documentation/catalogue/plan-defaut-sous-sa-reference.md`,
 * § 5 (suite du L1).
 *
 * Ce que seul le vrai SQL prouve : la table `sale_sku_alias` est lue avant la
 * résolution au catalogue, une ancienne référence se commande et se chiffre
 * sous l'article qu'elle désigne, la réponse et la ligne écrite portent la
 * référence normalisée — et, sans ligne d'alias, rien ne change.
 *
 * ⚠️ La ligne d'alias est semée en Prisma direct : la table n'a pas d'écrivain
 * dans le domaine, seule la migration de bascule (L3) l'écrira, en SQL.
 */
import { CustomerRole } from "../src/platform/database/client/client.js";
import type {
  OrderDraftResponse,
  PlacedOrderResponse,
  ShopCartView,
  ShopCatalogueView,
  ShopQuoteView,
} from "@lfd/contracts";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|alias-member";
/** Une ancienne référence, et l'article — présent au catalogue e2e — qu'elle désigne. */
const OLD = "VIE-000";
const TARGET = "VIE-001";

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_e2e", clientSecret: "pi_e2e_secret" }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

/** Le staff semé par le harnais : la surface admin est murée par l'annuaire. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: PaymentGateway, value: fakeGateway },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function seedAlias(): Promise<void> {
  await ctx.prisma.saleSkuAlias.create({
    data: { aliasSku: OLD, targetSku: TARGET, writtenAt: daysAgo(1) },
  });
}

async function seedProBuyer(): Promise<{ readonly companyId: string; readonly pickupId: string }> {
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  return { companyId: company.id, pickupId: point.id };
}

function pickupOrder(pickupId: string, sku: string): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    pickupAddressId: pickupId,
    requestedDeliveryDate: serviceDay(),
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku, quantity: 3 }],
  };
}

const shopQuote = (sku: string) =>
  ctx
    .http()
    .post("/shop/quote")
    .send({ lines: [{ sku, quantity: 2 }], fulfillment: null });

describe("une ancienne référence à l'entrée", () => {
  it("POST /orders en ancienne référence passe, et la ligne écrite est normalisée", async () => {
    await seedAlias();
    const { pickupId } = await seedProBuyer();

    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(MEMBER).post("/orders").send(pickupOrder(pickupId, OLD)).expect(201),
    );

    const lines = await ctx.prisma.orderLine.findMany({
      where: { orderId: placed.id },
      select: { sku: true, quantity: true },
    });
    expect(lines).toEqual([{ sku: TARGET, quantity: 3 }]);
  });

  it("le devis de la boutique chiffre l'ancienne référence et rend la normalisée", async () => {
    await seedAlias();

    const view = jsonBody<ShopQuoteView>(await shopQuote(OLD).expect(200));

    expect(view.lines.map((line) => line.sku)).toEqual([TARGET]);
  });

  it("le devis du staff rend la référence normalisée", async () => {
    await seedAlias();
    const { companyId } = await seedProBuyer();

    const view = jsonBody<{ readonly lines: readonly { readonly sku: string }[] }>(
      await ctx
        .asSub(E2E_STAFF_SUB)
        .post("/admin/orders/quote")
        .send({ companyId, lines: [{ sku: OLD, quantity: 2 }] })
        .expect(200),
    );

    expect(view.lines.map((line) => line.sku)).toEqual([TARGET]);
  });

  it("le panier gardé est réécrit normalisé", async () => {
    await seedAlias();
    await seedProBuyer();

    const saved = jsonBody<ShopCartView>(
      await ctx
        .asSub(MEMBER)
        .put("/shop/cart")
        .send({ lines: [{ sku: OLD, quantity: 2 }] })
        .expect(200),
    );

    expect(saved.lines).toEqual([{ sku: TARGET, quantity: 2 }]);

    const stored = await ctx.prisma.shopCart.findFirstOrThrow({ select: { payload: true } });
    expect(stored.payload).toEqual({ lines: [{ sku: TARGET, quantity: 2 }] });
  });

  it("le brouillon du staff se relit normalisé, écrit avant l'alias", async () => {
    const { companyId } = await seedProBuyer();
    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/admin/order-drafts/${companyId}`)
      .send({
        lines: [{ sku: OLD, productName: "", unitPriceMillicents: 0, vatRate: 0, quantity: 2 }],
      })
      .expect(200);
    await seedAlias();

    const { draft } = jsonBody<OrderDraftResponse>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/order-drafts/${companyId}`).expect(200),
    );

    expect(draft?.lines.map((line) => line.sku)).toEqual([TARGET]);
  });

  it("la vitrine publie la table", async () => {
    await seedAlias();

    const view = jsonBody<ShopCatalogueView>(await ctx.http().get("/shop/catalogue").expect(200));

    expect(view.saleSkuAliases).toEqual([{ aliasSku: OLD, targetSku: TARGET }]);
  });
});

describe("sans ligne d'alias — le comportement d'aujourd'hui", () => {
  it("une référence inconnue est refusée au devis, comme avant", async () => {
    await shopQuote(OLD).expect(400);
  });

  it("une référence connue se chiffre sous elle-même, et la vitrine publie une table vide", async () => {
    const view = jsonBody<ShopQuoteView>(await shopQuote(TARGET).expect(200));
    const catalogue = jsonBody<ShopCatalogueView>(
      await ctx.http().get("/shop/catalogue").expect(200),
    );

    expect(view.lines.map((line) => line.sku)).toEqual([TARGET]);
    expect(catalogue.saleSkuAliases).toEqual([]);
  });
});

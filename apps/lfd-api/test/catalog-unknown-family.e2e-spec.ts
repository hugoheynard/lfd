/**
 * E2E — **un article d'une famille inconnue ne met plus le catalogue pro en
 * panne** (plan `documentation/pricing/plan-familles-en-donnees.md`, lot 0).
 *
 * Régression de la panne du 2026-09-26 : une seconde famille « Viennoiseries »
 * créée au PIM n'avait pas de rayon, `shelfOfCategory` levait, et la
 * Tarification, le tarif d'un client, les Limites de prix et la liste
 * d'articles de la saisie répondaient 500. L'article est désormais servi SANS
 * famille : décisions d'article et de catalogue seulement, jamais un rayon
 * deviné.
 *
 * L'état est posé comme un push du référentiel le laisserait : une famille
 * reçue dans `catalog_categories`, et un article qui y est rangé.
 */
import type {
  AdminPlacedOrderResponse,
  CatalogItemView,
  OrderDraftResponse,
  OrderQuoteView,
  PricingBoardView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** L'id que le PIM a donné au doublon de production — un UUIDv7, sans rayon. */
const UNKNOWN_FAMILY = "01a031ff-146f-756f-a21b-4a2759a35e85";
/** Rangé dans la famille inconnue par `seedOrphan`. */
const ORPHAN = "VIE-002";
const BUYER = "auth0|acheteur-orphelin";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_orphan_${intentCounter}`,
      clientSecret: `pi_orphan_${intentCounter}_secret`,
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
  await seedOrphan();
});

const staff = () => ctx.asSub("staff-e2e");

/** La famille reçue du PIM sans rayon, et un article qui y est rangé. */
async function seedOrphan(): Promise<void> {
  await ctx.prisma.catalogCategory.create({
    data: {
      id: UNKNOWN_FAMILY,
      name: "Viennoiseries",
      slug: "viennoiseries",
      position: 5,
      vatRatePercent: 5.5,
      receivedAt: new Date(),
    },
  });
  await ctx.prisma.catalogItem.update({
    where: { sku: `${ORPHAN}-1` },
    data: { categoryId: UNKNOWN_FAMILY },
  });
}

async function seedBuyer(): Promise<{ companyId: string; buyerId: string; pickupId: string }> {
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "orphelin@test.fr" });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerId: buyer.id, pickupId: point.id };
}

function postRule(scope: { type: string; id: string | null }, value: number) {
  return staff()
    .post("/admin/pricing/rules")
    .send({
      stage: "promotion",
      scope,
      audience: { type: "all", id: null },
      minQuantity: null,
      effect: { nature: "alter", direction: "decrease", mode: "percent", value },
      label: "Promo e2e",
      validFrom: new Date(Date.now() - 86_400_000).toISOString(),
      validTo: null,
    })
    .expect(201);
}

async function quoteOf(companyId: string, sku: string) {
  const quote = jsonBody<OrderQuoteView>(
    await staff()
      .post("/admin/orders/quote")
      .send({ companyId, lines: [{ sku, quantity: 1 }] })
      .expect(200),
  );
  const line = quote.lines[0];
  if (line === undefined) {
    throw new Error(`devis sans ligne pour ${sku}`);
  }
  return line;
}

describe("un article d'une famille inconnue — la panne du 2026-09-26", () => {
  it("ne met pas le catalogue pro en 500 : la saisie le liste, sans famille", async () => {
    const items = jsonBody<CatalogItemView[]>(
      await staff().get("/admin/catalog/sellable").expect(200),
    );

    expect(items.find((item) => item.sku === ORPHAN)?.category).toBeNull();
    expect(items.find((item) => item.sku === "VIE-001")?.category).toBe("viennoiserie");
  });

  it("laisse la Tarification se charger, et le compte", async () => {
    const board = jsonBody<PricingBoardView>(await staff().get("/admin/pricing").expect(200));

    expect(board.unknownFamilyCount).toBe(1);
    const skus = board.categories.flatMap((category) => category.items.map((item) => item.sku));
    expect(skus).not.toContain(ORPHAN);
    expect(skus).toContain("VIE-001");
  });

  it("laisse les Limites de prix et le tarif d'un client se charger", async () => {
    const { companyId } = await seedBuyer();

    await staff().get("/admin/pricing/floors?clientele=pro").expect(200);
    await staff().get(`/admin/pricing/companies/${companyId}`).expect(200);
  });
});

describe("il se tarife sans décision de famille", () => {
  it("ne reçoit pas la règle de sa famille d'origine", async () => {
    const { companyId } = await seedBuyer();
    await postRule({ type: "category", id: "viennoiserie" }, 5_000);

    const orphan = await quoteOf(companyId, ORPHAN);
    const known = await quoteOf(companyId, "VIE-001");

    expect(orphan.unitPriceMillicents).toBe(orphan.canonicalMillicents);
    expect(known.unitPriceMillicents).toBe(known.canonicalMillicents / 2);
  });

  it("reçoit les décisions d'article, et la limite du catalogue le relève", async () => {
    const { companyId } = await seedBuyer();
    await staff()
      .put("/admin/pricing/floors")
      .send({ scope: { type: "global", id: null }, mode: "percent", value: 6_000 })
      .expect(204);
    await postRule({ type: "product", id: ORPHAN }, 9_000);

    const line = await quoteOf(companyId, ORPHAN);

    expect(line.steps.map((step) => step.stage)).toEqual(["promotion"]);
    expect(line.floored).toBe(true);
    // −90 % l'aurait mis à 10 % du tarif : la limite l'a relevé au-dessus.
    expect(line.unitPriceMillicents).toBeGreaterThan(line.canonicalMillicents / 10);
  });
});

describe("un brouillon et une commande qui le contiennent passent", () => {
  it("met de côté un brouillon, puis passe la commande", async () => {
    const { companyId, buyerId, pickupId } = await seedBuyer();
    await staff()
      .put(`/admin/order-drafts/${companyId}`)
      .send({ lines: [{ sku: ORPHAN, quantity: 6 }] })
      .expect(200);
    const { draft } = jsonBody<OrderDraftResponse>(
      await staff().get(`/admin/order-drafts/${companyId}`).expect(200),
    );
    expect(draft?.lines).toEqual([{ sku: ORPHAN, quantity: 6 }]);

    const placed = jsonBody<AdminPlacedOrderResponse>(
      await staff()
        .post("/admin/orders")
        .send({
          companyId,
          buyerUserId: buyerId,
          settlement: "account",
          requestedDeliveryDate: serviceDay(),
          fulfillmentMethod: "pickup",
          pickupAddressId: pickupId,
          requestedWindow: { start: "07:00", end: "08:00" },
          lines: [{ sku: ORPHAN, quantity: 6 }],
        })
        .expect(201),
    );

    const lines = await ctx.prisma.orderLine.findMany({ where: { orderId: placed.id } });
    expect(lines.map((line) => line.sku)).toEqual([ORPHAN]);
  });
});

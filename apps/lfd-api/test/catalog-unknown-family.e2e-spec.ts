/**
 * E2E — **une famille livrée par le référentiel devient un rayon, sans
 * déploiement** (plan `documentation/pricing/plan-familles-en-donnees.md`).
 *
 * Régression de la panne du 2026-09-26 : une famille créée au PIM n'avait pas
 * de rayon dans la table en dur, la traduction levait, et la Tarification,
 * le tarif d'un client, les Limites de prix et la liste d'articles de la saisie
 * répondaient 500. Le lot 0 servait l'article sans famille ; depuis que la
 * famille est une donnée, il n'y a plus rien à traduire : la famille reçue EST
 * le rayon, avec son nom et sa position, tarifable et limitable par son id.
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
import { E2E_FAMILIES } from "./catalog-fixture.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** L'id que le PIM a donné à la famille de la panne — un UUIDv7, inconnu du code. */
const UNKNOWN_FAMILY = "01a031ff-146f-756f-a21b-4a2759a35e85";
/** Une famille orpheline du miroir : reçue un jour, plus aucun article vivant. */
const ORPHAN_FAMILY = "fam-orpheline";
/** Rangé dans la famille nouvelle par `seedOrphan`. */
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

/**
 * La famille reçue du PIM, inconnue du code, un article qui y est rangé — et
 * une famille orpheline, reçue mais sans article vivant.
 */
async function seedOrphan(): Promise<void> {
  await ctx.prisma.catalogCategory.createMany({
    data: [
      {
        id: UNKNOWN_FAMILY,
        name: "Viennoiseries du matin",
        slug: "viennoiseries-du-matin",
        position: 5,
        vatRatePercent: 5.5,
        receivedAt: new Date(),
      },
      {
        id: ORPHAN_FAMILY,
        name: "Orpheline",
        slug: "orpheline",
        position: 9,
        vatRatePercent: 5.5,
        receivedAt: new Date(),
      },
    ],
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

describe("une famille livrée par le référentiel — la panne du 2026-09-26", () => {
  it("devient un rayon de la saisie, avec son nom et sa position", async () => {
    const items = jsonBody<CatalogItemView[]>(
      await staff().get("/admin/catalog/sellable").expect(200),
    );

    expect(items.find((item) => item.sku === ORPHAN)?.family).toEqual({
      id: UNKNOWN_FAMILY,
      name: "Viennoiseries du matin",
      position: 5,
    });
    expect(items.find((item) => item.sku === "VIE-001")?.family?.id).toBe(E2E_FAMILIES.VIE.id);
    // Le champ déprécié reste servi, et toujours à `null`.
    expect(items.every((item) => item.category === null)).toBe(true);
  });

  it("devient une bande de la Tarification, à sa position — sans famille orpheline", async () => {
    const board = jsonBody<PricingBoardView>(await staff().get("/admin/pricing").expect(200));

    expect(board.unknownFamilyCount).toBe(0);
    const ids = board.categories.map((category) => category.id);
    expect(ids).toEqual([
      E2E_FAMILIES.VIE.id,
      E2E_FAMILIES.PAI.id,
      E2E_FAMILIES.PAT.id,
      E2E_FAMILIES.SAL.id,
      E2E_FAMILIES.CHO.id,
      UNKNOWN_FAMILY,
    ]);
    expect(ids).not.toContain(ORPHAN_FAMILY);
    const band = board.categories.find((category) => category.id === UNKNOWN_FAMILY);
    expect(band?.family).toEqual({
      id: UNKNOWN_FAMILY,
      name: "Viennoiseries du matin",
      position: 5,
    });
    expect(band?.items.map((item) => item.sku)).toEqual([ORPHAN]);
  });

  it("laisse les Limites de prix et le tarif d'un client se charger", async () => {
    const { companyId } = await seedBuyer();

    await staff().get("/admin/pricing/floors?clientele=pro").expect(200);
    const company = await staff().get(`/admin/pricing/companies/${companyId}`).expect(200);
    const categories = jsonBody<{ categories: { id: string }[] }>(company).categories;
    expect(categories.map((category) => category.id)).toContain(UNKNOWN_FAMILY);
    expect(categories.map((category) => category.id)).not.toContain(ORPHAN_FAMILY);
  });
});

describe("elle se tarife et se limite par son id", () => {
  it("reçoit la règle posée sur ELLE, et pas celle de sa voisine", async () => {
    const { companyId } = await seedBuyer();
    await postRule({ type: "category", id: UNKNOWN_FAMILY }, 5_000);

    const orphan = await quoteOf(companyId, ORPHAN);
    const known = await quoteOf(companyId, "VIE-001");

    expect(orphan.unitPriceMillicents).toBe(orphan.canonicalMillicents / 2);
    expect(known.unitPriceMillicents).toBe(known.canonicalMillicents);
  });

  it("se limite par son id : la limite de sa famille le relève", async () => {
    const { companyId } = await seedBuyer();
    await staff()
      .put("/admin/pricing/floors")
      .send({ scope: { type: "category", id: UNKNOWN_FAMILY }, mode: "percent", value: 6_000 })
      .expect(204);
    await postRule({ type: "product", id: ORPHAN }, 9_000);

    const line = await quoteOf(companyId, ORPHAN);

    expect(line.steps.map((step) => step.stage)).toEqual(["promotion"]);
    expect(line.floored).toBe(true);
    // −90 % l'aurait mis à 10 % du tarif : la limite l'a relevé à 60 %.
    expect(line.unitPriceMillicents).toBe((line.canonicalMillicents * 6) / 10);
  });
});

describe("une sous-famille suit son chemin", () => {
  /** Une sous-famille des pâtisseries, livrée par le référentiel, et un article rangé dedans. */
  async function seedTartes(): Promise<string> {
    const tartes = "fam-tartes";
    await ctx.prisma.catalogCategory.create({
      data: {
        id: tartes,
        name: "Tartes",
        slug: "tartes",
        parentId: E2E_FAMILIES.PAT.id,
        position: 3,
        vatRatePercent: 5.5,
        receivedAt: new Date(),
      },
    });
    await ctx.prisma.catalogItem.update({
      where: { sku: "PAT-001-1" },
      data: { categoryId: tartes },
    });
    return tartes;
  }

  it("reçoit la règle de sa famille parente", async () => {
    const { companyId } = await seedBuyer();
    await seedTartes();
    await postRule({ type: "category", id: E2E_FAMILIES.PAT.id }, 5_000);

    const line = await quoteOf(companyId, "PAT-001");

    expect(line.unitPriceMillicents).toBe(line.canonicalMillicents / 2);
  });

  it("la règle de la famille la plus proche l'emporte sur celle de la parente", async () => {
    const { companyId } = await seedBuyer();
    const tartes = await seedTartes();
    await postRule({ type: "category", id: E2E_FAMILIES.PAT.id }, 5_000);
    await postRule({ type: "category", id: tartes }, 2_500);

    const line = await quoteOf(companyId, "PAT-001");

    expect(line.unitPriceMillicents).toBe((line.canonicalMillicents * 3) / 4);
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

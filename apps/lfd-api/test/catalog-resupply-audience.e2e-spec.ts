/**
 * E2E — **l'audience « réassort seulement »**, du référentiel au comptoir
 * (`documentation/reassort-boutiques/plan-articles-de-reassort.md`, lot B).
 *
 * Ce que seul ce niveau prouve : le `CHECK` du référentiel admet la valeur,
 * le fait de fiche la porte jusqu'au miroir du commerce, et les lectures
 * d'acheteur l'écartent pendant que le catalogue du réassort la propose.
 */
import { CatalogReader } from "../src/lafoliecoffee/catalog/domain/ports/catalog.reader.js";
import { staffViewer } from "../src/lafoliecoffee/catalog/domain/catalog-viewer.js";
import { ResupplyCatalogue } from "../src/lafoliecoffee/resupply/domain/resupply-catalogue.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import {
  activateFiche,
  aDraftFiche,
  anActiveFiche,
  type Fiche,
  relayAll,
  SILENT_TRIGGER,
} from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

async function publicShelf(): Promise<readonly string[]> {
  const shop = jsonBody<{ items: { sku: string }[] }>(
    await ctx.http().get("/shop/catalogue").expect(200),
  );
  return shop.items.map((entry) => entry.sku);
}

async function proCatalogue(): Promise<readonly string[]> {
  const items = await ctx.app.get(CatalogReader).listSellable(staffViewer("pro"));
  return items.map((item) => item.sku);
}

async function resupplyCatalogue(): Promise<readonly string[]> {
  const articles = await ctx.app.get(ResupplyCatalogue).articles();
  return articles.map((article) => article.sku);
}

describe("un article réservé au réassort des boutiques", () => {
  it("arrive au commerce sans attente de validation, et ne se sert qu'au réassort", async () => {
    const cookie = await anActiveFiche(staff, "Cookie formule", "resupply");
    const witness = await anActiveFiche(staff, "Croissant", "public");

    await relayAll(ctx);

    expect(
      await ctx.prisma.catalogItem.findUnique({ where: { sku: cookie.variantSku } }),
    ).toMatchObject({ audience: "resupply", publicReviewPending: false, proReviewPending: false });
    expect(await publicShelf()).not.toContain(cookie.variantSku);
    expect(await proCatalogue()).not.toContain(cookie.variantSku);
    expect(await resupplyCatalogue()).toContain(cookie.variantSku);
    await expect(ctx.app.get(ResupplyCatalogue).article(cookie.variantSku)).resolves.toMatchObject({
      sku: cookie.variantSku,
      internal: true,
    });
    // Le témoin public attend sa validation : le réassort suit la vitrine.
    expect(await resupplyCatalogue()).not.toContain(witness.variantSku);
  });

  it("sert sa famille avec ses parentes, pour le rail des rayons en arbre", async () => {
    const cookie = await anActiveFiche(staff, "Cookie formule", "resupply");
    const parent = await anActiveFiche(staff, "Croissant", "public");
    await staff()
      .put(`/pim/catalogue/categories/${cookie.categoryId}/parent`)
      .send({ parentId: parent.categoryId })
      .expect(200);

    await relayAll(ctx);

    const articles = await ctx.app.get(ResupplyCatalogue).articles();
    const served = articles.find((article) => article.sku === cookie.variantSku);
    expect(served?.categoryId).toBe(cookie.categoryId);
    expect(served?.family).toMatchObject({
      id: cookie.categoryId,
      path: [cookie.categoryId, parent.categoryId],
      ancestors: [expect.objectContaining({ id: parent.categoryId, name: "Famille Croissant" })],
    });
    await expect(ctx.app.get(ResupplyCatalogue).article(cookie.variantSku)).resolves.toMatchObject({
      family: { ancestors: [expect.objectContaining({ id: parent.categoryId })] },
    });
  });

  /**
   * Régression : une fiche `resupply` sans aucun prix s'activait, puis la
   * projection du fait la jugeait « vendable sans prix » et levait une 500.
   */
  it("s'active sans aucun prix, et se commande au réassort", async () => {
    const cookie = await activateFiche(
      staff,
      await aDraftFiche(staff, "Cookie formule"),
      "resupply",
      [],
      false,
    );

    await relayAll(ctx);

    expect(
      await ctx.prisma.catalogItem.findUnique({ where: { sku: cookie.variantSku } }),
    ).toMatchObject({ audience: "resupply", priceMillicents: null });
    expect(await resupplyCatalogue()).toContain(cookie.variantSku);
    expect(await publicShelf()).not.toContain(cookie.variantSku);
  });

  it("se règle aussi sur la famille, et se trace au journal", async () => {
    const cookie = await anActiveFiche(staff, "Cookie formule");

    await staff()
      .put(`/pim/catalogue/categories/${cookie.categoryId}/audience`)
      .send({ audience: "resupply" })
      .expect(200);
    await relayAll(ctx);

    expect(
      (await ctx.prisma.catalogItem.findUnique({ where: { sku: cookie.variantSku } }))?.audience,
    ).toBe("resupply");
    expect(await resupplyCatalogue()).toContain(cookie.variantSku);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: cookie.categoryId, type: "product_category.audience_changed" },
      }),
    ).toBe(1);
  });
});

const PRODUCTS = "/pim/catalogue/products";

/**
 * Le cookie vendu au public et sa déclinaison « formule », ajoutée sans prix
 * et posée en `resupply` (`plan-audience-par-declinaison.md`, AD1).
 */
async function cookieWithFormula(): Promise<{ cookie: Fiche; formulaSku: string }> {
  const cookie = await anActiveFiche(staff, "Cookie", "public");
  const formulaId = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${cookie.id}/variants`)
      .set(INTENT_KEY, freshIntent())
      .send({ name: { fr: "Cookie formule" } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${cookie.id}/variants/${formulaId}/audience`)
    .send({ audience: "resupply" })
    .expect(200);
  const detail = jsonBody<{ variants: { id: string; sku: string; audience: string | null }[] }>(
    await staff().get(`${PRODUCTS}/${cookie.id}`).expect(200),
  );
  const formula = detail.variants.find((variant) => variant.id === formulaId);
  expect(formula?.audience).toBe("resupply");
  return { cookie, formulaSku: formula?.sku ?? "" };
}

/** Valide pour les deux audiences toutes les lignes en vente. */
async function approveAll(): Promise<void> {
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { withdrawnAt: null }, select: { sku: true } })
  ).map((row) => row.sku);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
}

describe("une déclinaison réservée au réassort, sur une fiche publique", () => {
  it("cookie public, formule `resupply` sans prix : la formule ne sert qu'au réassort, le cookie reste en vitrine", async () => {
    const { cookie, formulaSku } = await cookieWithFormula();
    await relayAll(ctx);
    await approveAll();

    expect(await ctx.prisma.catalogItem.findUnique({ where: { sku: formulaSku } })).toMatchObject({
      audience: "resupply",
      priceMillicents: null,
      publicTtcCents: null,
    });
    expect(await publicShelf()).toContain(cookie.variantSku);
    expect(await publicShelf()).not.toContain(formulaSku);
    expect(await proCatalogue()).not.toContain(formulaSku);
    expect(await resupplyCatalogue()).toContain(formulaSku);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: cookie.id, type: "product.variant_audience_changed" },
      }),
    ).toBe(1);
  });

  it("refuse une audience propre sur le défaut, et sur une fiche sans vignettes", async () => {
    const { cookie } = await cookieWithFormula();
    const detail = jsonBody<{ variants: { id: string; isDefault: boolean }[] }>(
      await staff().get(`${PRODUCTS}/${cookie.id}`).expect(200),
    );
    const defaultId = detail.variants.find((variant) => variant.isDefault)?.id ?? "";

    await staff()
      .put(`${PRODUCTS}/${cookie.id}/variants/${defaultId}/audience`)
      .send({ audience: "pro" })
      .expect(409);
    await staff()
      .put(`${PRODUCTS}/${cookie.id}/variants-as-tiles`)
      .send({ variantsAsTiles: false })
      .expect(409);
  });

  /**
   * Q1 (Hugo, 2026-11-24) : rendue au public, la formule attend de nouveau sa
   * validation publique — un geste du staff au référentiel reste à regarder.
   */
  it("rendue au public, la déclinaison attend de nouveau sa validation publique", async () => {
    const { cookie, formulaSku } = await cookieWithFormula();
    const formulaId = (
      await ctx.prisma.productVariant.findFirst({
        where: { sku: formulaSku },
        select: { id: true },
      })
    )?.id;
    await staff()
      .put(`${PRODUCTS}/${cookie.id}/variants/${formulaId ?? ""}/pricing`)
      .send({ priceCents: 300, weightGrams: null })
      .expect(200);
    await relayAll(ctx);
    await approveAll();

    await staff()
      .put(`${PRODUCTS}/${cookie.id}/variants/${formulaId ?? ""}/audience`)
      .send({ audience: null })
      .expect(200);
    await relayAll(ctx);

    expect(await ctx.prisma.catalogItem.findUnique({ where: { sku: formulaSku } })).toMatchObject({
      audience: "public",
      publicReviewPending: true,
    });
    expect(await publicShelf()).not.toContain(formulaSku);
  });

  /** Voulu : `servedToResupply` refuse un article masqué, quelle que soit son audience. */
  it("masquée au public pendant sa vie publique, elle reste absente du réassort une fois en `resupply`", async () => {
    const cookie = await anActiveFiche(staff, "Cookie", "public");
    const formulaId = jsonBody<{ id: string }>(
      await staff()
        .post(`${PRODUCTS}/${cookie.id}/variants`)
        .set(INTENT_KEY, freshIntent())
        .send({ name: { fr: "Cookie formule" } })
        .expect(201),
    ).id;
    await staff()
      .put(`${PRODUCTS}/${cookie.id}/variants/${formulaId}/pricing`)
      .send({ priceCents: 300, weightGrams: null })
      .expect(200);
    await relayAll(ctx);
    const formulaSku =
      (await ctx.prisma.productVariant.findUnique({ where: { id: formulaId } }))?.sku ?? "";
    await approveAll();
    await staff()
      .put(`/admin/catalog/${formulaSku}/masking`)
      .send({ audience: "public", hidden: true })
      .expect(204);

    await staff()
      .put(`${PRODUCTS}/${cookie.id}/variants/${formulaId}/audience`)
      .send({ audience: "resupply" })
      .expect(200);
    await relayAll(ctx);

    expect(
      (await ctx.prisma.catalogItem.findUnique({ where: { sku: formulaSku } }))?.audience,
    ).toBe("resupply");
    expect(await resupplyCatalogue()).not.toContain(formulaSku);
  });
});

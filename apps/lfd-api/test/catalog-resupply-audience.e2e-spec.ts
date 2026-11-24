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
import { anActiveFiche, relayAll, SILENT_TRIGGER } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

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
    });
    // Le témoin public attend sa validation : le réassort suit la vitrine.
    expect(await resupplyCatalogue()).not.toContain(witness.variantSku);
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

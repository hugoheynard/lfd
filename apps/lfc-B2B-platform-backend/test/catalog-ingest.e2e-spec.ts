/**
 * E2E de l'**ingestion du catalogue** poussé par le PIM — sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve, et qu'aucun test unitaire ne pourrait :
 * l'`upsert` ne cascade pas sur les décisions locales, alors qu'une ingestion en
 * « table rase » les effacerait. C'est le piège de ce chantier, et il ne se voit
 * qu'avec les vraies clés étrangères.
 */
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_CATALOG_SECRET } from "./setup-env.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const CATEGORY = {
  id: "cat_vien",
  name: "Viennoiseries",
  slug: "viennoiseries",
  parentId: null,
  position: 0,
  vatRatePercent: 5.5,
};

function snapshot(skus: readonly { sku: string; priceCents: number }[]): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-08-17T08:00:00.000Z",
    categories: [CATEGORY],
    products: skus.map(({ sku, priceCents }) => ({
      id: `prd_${sku}`,
      sku,
      name: `Produit ${sku}`,
      categoryId: CATEGORY.id,
      kind: "daily" as const,
      variants: [
        {
          sku: `${sku}-1`,
          name: `Produit ${sku}`,
          priceCents,
          weightGrams: null,
          isDefault: true,
          position: 0,
        },
      ],
    })),
  };
}

function push(body: unknown) {
  return ctx
    .http()
    .post("/catalog/ingest")
    .set("x-lfc-catalog-secret", TEST_CATALOG_SECRET)
    .send(body);
}

describe("POST /catalog/ingest", () => {
  it("refuse sans le secret partagé", async () => {
    const response = await ctx.http().post("/catalog/ingest").send(snapshot([]));

    expect(response.status).toBe(401);
  });

  it("refuse avec un mauvais secret", async () => {
    const response = await ctx
      .http()
      .post("/catalog/ingest")
      .set("x-lfc-catalog-secret", "pas-le-bon")
      .send(snapshot([]));

    expect(response.status).toBe(401);
  });

  it("refuse une version de format inconnue plutôt que d'ingérer à moitié", async () => {
    const response = await push({ ...snapshot([]), version: 99 });

    expect(response.status).toBe(400);
    expect(await ctx.prisma.catalogItem.count()).toBe(0);
  });

  it("écrit le catalogue et rend des compteurs", async () => {
    const response = await push(snapshot([{ sku: "VIE-001", priceCents: 200 }]));

    expect(response.status).toBe(201);
    expect(jsonBody(response)).toMatchObject({
      acceptedProducts: 1,
      acceptedVariants: 1,
      acceptedCategories: 1,
      removedSkus: [],
    });
    expect(await ctx.prisma.catalogItem.count()).toBe(1);
  });

  it("reçoit le taux de TVA de la famille, au lieu de le supposer", async () => {
    await push(snapshot([{ sku: "VIE-001", priceCents: 200 }]));

    const category = await ctx.prisma.catalogCategory.findUniqueOrThrow({
      where: { id: CATEGORY.id },
    });

    expect(category.vatRatePercent.toNumber()).toBe(5.5);
  });

  /**
   * Régression **par anticipation** : une ingestion écrite en `deleteMany` +
   * `createMany` passerait tous les autres tests de ce fichier, et effacerait en
   * silence chaque prix négocié à chaque push. La cascade est réelle en base ;
   * seul ce test la met sous tension.
   */
  it("un push ne perd pas les décisions déjà prises", async () => {
    await push(snapshot([{ sku: "VIE-001", priceCents: 200 }]));
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-001-1", priceCents: 180, decidedBy: "cecile" },
    });

    // Le PIM augmente son prix : le miroir doit suivre, la décision rester.
    await push(snapshot([{ sku: "VIE-001", priceCents: 220 }]));

    const item = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "VIE-001-1" },
      include: { override: true },
    });
    expect(item.priceCents).toBe(220);
    expect(item.override?.priceCents).toBe(180);
    expect(item.override?.decidedBy).toBe("cecile");
  });

  it("retire ce qui a disparu du snapshot, et le NOMME", async () => {
    await push(
      snapshot([
        { sku: "VIE-001", priceCents: 200 },
        { sku: "VIE-002", priceCents: 220 },
      ]),
    );

    const response = await push(snapshot([{ sku: "VIE-001", priceCents: 200 }]));

    expect(jsonBody(response)).toMatchObject({ removedSkus: ["VIE-002-1"] });
    expect(await ctx.prisma.catalogItem.count()).toBe(1);
  });

  /**
   * L'autre face de la cascade, celle où elle est juste : un article retiré de la
   * vente emporte sa décision de prix, parce qu'un tarif négocié ne veut plus
   * rien dire sans l'article qu'il tarifait.
   */
  it("un article retiré emporte sa décision", async () => {
    await push(snapshot([{ sku: "VIE-001", priceCents: 200 }]));
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-001-1", priceCents: 180 },
    });

    await push(snapshot([]));

    expect(await ctx.prisma.catalogItemOverride.count()).toBe(0);
  });
});

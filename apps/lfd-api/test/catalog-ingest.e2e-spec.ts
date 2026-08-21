/**
 * E2E de l'**ingestion du catalogue** venu du référentiel — sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve, et qu'aucun test unitaire ne pourrait :
 * l'ingestion ne cascade pas sur les décisions locales, alors qu'une écriture en
 * « table rase » les effacerait. C'est le piège de ce chantier, et il ne se voit
 * qu'avec les vraies clés étrangères.
 *
 * L'entrée n'est plus une route : le fil est passé par le port
 * `B2bCatalogDriver`, relié par la racine de composition. La suite l'appelle
 * donc comme le référentiel l'appelle. Ce qui a disparu avec le HTTP, ce sont
 * les deux tests de secret partagé — il n'y a plus de secret, plus de porte, et
 * plus rien à refuser : c'est le gain, pas un trou de couverture.
 */
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Cette suite mesure ce qu'une INGESTION écrit : elle doit donc partir d'un
  // catalogue vide. Le harnais en sème un depuis la bascule (il est l'autorité
  // de prix du checkout), et le compter ici ferait échouer les compteurs pour
  // une raison qui n'a rien à voir avec l'ingestion.
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
});

const CATEGORY = {
  id: "cat_vien",
  name: "Viennoiseries",
  slug: "viennoiseries",
  parentId: null,
  position: 0,
  vatRatePercent: 5.5,
};

function snapshot(
  skus: readonly { sku: string; priceCents: number; vatRatePercent?: number | null }[],
): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-08-17T08:00:00.000Z",
    categories: [CATEGORY],
    products: skus.map(({ sku, priceCents, vatRatePercent = 5.5 }) => ({
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
          vatRatePercent,
        },
      ],
    })),
  };
}

function push(body: CatalogSnapshot) {
  return ctx.app.get(B2bCatalogDriver).send(body);
}

describe("le fil catalogue, côté plateforme", () => {
  it("écrit le catalogue et rend des compteurs", async () => {
    const report = await push(snapshot([{ sku: "VIE-001", priceCents: 200 }]));

    expect(report).toMatchObject({
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

    expect(category.vatRatePercent?.toNumber()).toBe(5.5);
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

    const report = await push(snapshot([{ sku: "VIE-001", priceCents: 200 }]));

    expect(report).toMatchObject({ removedSkus: ["VIE-002-1"] });
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

describe("le taux de TVA arrive sur l’ARTICLE", () => {
  /**
   * Le défaut corrigé : la boutique retrouvait le taux en rejoignant la
   * famille, donc la ligne facturée dépendait d'une jointure et d'un
   * rafraîchissement de famille réussi. Un article se vend seul ; il doit
   * pouvoir se facturer seul.
   */
  it("écrit le taux reçu sur la ligne d’article", async () => {
    await push(snapshot([{ sku: "VIE-002", priceCents: 220, vatRatePercent: 20 }]));

    const item = await ctx.prisma.catalogItem.findUniqueOrThrow({ where: { sku: "VIE-002-1" } });

    expect(item.vatRatePercent?.toNumber()).toBe(20);
  });

  /** Famille non réglée dans le référentiel : l'article entre sans taux. */
  it("laisse le taux vide quand le référentiel n’en a pas", async () => {
    await push(snapshot([{ sku: "VIE-003", priceCents: 240, vatRatePercent: null }]));

    const item = await ctx.prisma.catalogItem.findUniqueOrThrow({ where: { sku: "VIE-003-1" } });

    expect(item.vatRatePercent).toBeNull();
  });
});

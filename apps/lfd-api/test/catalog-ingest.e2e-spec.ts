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
import { type CatalogSnapshot } from "@lfd/catalog-sync";

import { CanonicalPriceHistoryReader } from "../src/b2b/catalog/domain/ports/canonical-price-history.reader.js";
import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { CATEGORY, snapshotOf } from "./catalog-ingest-fixtures.js";
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
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
});

function push(body: CatalogSnapshot) {
  // L'origine voyage avec le snapshot depuis que la plateforme peut le RECEVOIR
  // au lieu de l'appliquer : elle a besoin de l'ancre et de l'empreinte, qu'elle
  // ne peut pas aller lire chez le référentiel.
  return ctx.app.get(B2bCatalogDriver).send(body, {
    revisionId: "rev_e2e",
    fingerprint: "empreinte-e2e",
  });
}

describe("le fil catalogue, côté plateforme", () => {
  it("écrit le catalogue et rend des compteurs", async () => {
    const report = await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));

    expect(report).toMatchObject({
      acceptedProducts: 1,
      acceptedVariants: 1,
      acceptedCategories: 1,
      removedSkus: [],
    });
    expect(await ctx.prisma.catalogItem.count()).toBe(1);
  });

  it("reçoit le taux de TVA de la famille, au lieu de le supposer", async () => {
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));

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
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-001-1", priceMillicents: 180_000, decidedBy: "cecile" },
    });

    // Le PIM augmente son prix : le miroir doit suivre, la décision rester.
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 220_000 }]));

    const item = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "VIE-001-1" },
      include: { override: true },
    });
    expect(item.priceMillicents).toBe(220_000);
    expect(item.override?.priceMillicents).toBe(180_000);
    expect(item.override?.decidedBy).toBe("cecile");
  });

  it("retire ce qui a disparu du snapshot, et le NOMME", async () => {
    await push(
      snapshotOf([
        { sku: "VIE-001", priceMillicents: 200_000 },
        { sku: "VIE-002", priceMillicents: 220_000 },
      ]),
    );

    const report = await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));

    expect(report).toMatchObject({ removedSkus: ["VIE-002-1"] });
    // La LIGNE reste — le retrait marque. Ce qui disparaît, c'est la vente :
    // le catalogue vendable n'en compte plus qu'un.
    expect(await ctx.prisma.catalogItem.count()).toBe(2);
    expect(await ctx.prisma.catalogItem.count({ where: { withdrawnAt: null } })).toBe(1);
  });

  /**
   * 🔴 **Ce cas dit désormais l'inverse de ce qu'il disait**, et son ancien JSDoc
   * mérite d'être cité plutôt qu'effacé :
   *
   * > « L'autre face de la cascade, celle où elle est juste : un article retiré
   * > de la vente emporte sa décision de prix, parce qu'un tarif négocié ne veut
   * > plus rien dire sans l'article qu'il tarifait. »
   *
   * C'était vrai **tant que le retrait était définitif**. Ce n'est pas un
   * jugement qui a changé, c'est le monde : le retour arrière rejoue une version
   * ancienne, donc retire les SKU entrés depuis — et détruirait les prix négociés
   * des articles les PLUS récents, ceux sur lesquels un commercial vient de
   * travailler.
   *
   * La cascade est toujours là dans le schéma. Elle ne se déclenche simplement
   * plus, et la retirer ferait croire qu'une suppression physique est devenue
   * sûre.
   */
  it("un article retiré GARDE sa décision, qui l'attend", async () => {
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-001-1", priceMillicents: 180_000 },
    });

    await push(snapshotOf([]));

    expect(await ctx.prisma.catalogItemOverride.count()).toBe(1);
    const retire = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "VIE-001-1" },
    });
    expect(retire.withdrawnAt).toBeInstanceOf(Date);
  });

  /**
   * 🔴 Le cas qui rend le retrait réversible, et le seul qui prouve que la
   * réintroduction fonctionne. Le miroir ne rend plus les retirés, donc un SKU
   * qui revient repasse par `CatalogItem.receive` — dont le retrait est `null`,
   * et qui réécrit la colonne. Sans ce passage, l'article resterait invisible
   * pour toujours pendant que le push l'annoncerait accepté.
   */
  it("remet en vente un article qui revient, avec le prix qu'on lui avait négocié", async () => {
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-001-1", priceMillicents: 180_000 },
    });
    await push(snapshotOf([]));

    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));

    const item = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "VIE-001-1" },
      include: { override: true },
    });
    expect(item.withdrawnAt).toBeNull();
    expect(item.override?.priceMillicents).toBe(180_000);
  });

  /**
   * Le retrait est daté UNE fois. Deux pushes successifs qui l'ignorent tous
   * deux ne repoussent pas la date : c'est la première sortie qui répond à
   * « depuis quand », et un second push ne doit pas effacer cette réponse.
   */
  it("ne repousse pas la date d'un article déjà retiré", async () => {
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));
    await push(snapshotOf([]));
    const premier = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "VIE-001-1" },
    });

    await push(snapshotOf([]));

    const second = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "VIE-001-1" },
    });
    expect(second.withdrawnAt).toEqual(premier.withdrawnAt);
  });
});

describe("l'historique du tarif canonique", () => {
  const AFTER = new Date("2100-01-01T00:00:00.000Z");

  function history() {
    return ctx.app.get(CanonicalPriceHistoryReader);
  }

  /**
   * **Se relit par SKU de PRODUIT** — l'unité que la plateforme vend
   * (`ProductCatalogReader` expose `sku: item.productSku`). La trace porte les
   * deux SKU ; c'est le groupement qui choisit, et il choisit ce que les
   * appelants ont en main.
   */
  it("se relit par SKU de PRODUIT, l'unité vendue", async () => {
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));

    const pricing = await history().pricingAt(AFTER);

    expect(pricing.get("VIE-001")?.unitPriceMillicents).toBe(200_000);
    // La trace porte bien le SKU d'article, elle : c'est le groupement qui
    // remonte au produit, pas l'écriture qui perd l'information.
    const rows = await ctx.prisma.catalogPriceHistory.findMany({ where: { sku: "VIE-001-1" } });
    expect(rows).toHaveLength(1);
  });

  it("historise le taux AVEC le prix — sans lui, la ligne n'est pas facturable", async () => {
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000, vatRatePercent: 5.5 }]));

    expect((await history().pricingAt(AFTER)).get("VIE-001")).toEqual({
      sku: "VIE-001",
      unitPriceMillicents: 200_000,
      vatRatePercent: 5.5,
    });
  });

  /**
   * Le jour d'une bascule de taux légal, le prix ne bouge pas et toutes les
   * factures changent. Une garde qui ne comparerait que le prix dirait que rien
   * n'a eu lieu.
   */
  it("trace un changement de TAUX seul, à prix constant", async () => {
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000, vatRatePercent: 5.5 }]));
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000, vatRatePercent: 10 }]));

    expect(await ctx.prisma.catalogPriceHistory.count()).toBe(2);
    expect((await history().pricingAt(AFTER)).get("VIE-001")?.vatRatePercent).toBe(10);
  });

  /**
   * L'autre moitié de la même règle : un push identique n'écrit rien. Sans
   * cette garde, une synchronisation quotidienne de 92 articles rendrait
   * l'historique illisible en une semaine.
   */
  it("n'écrit rien quand ni le prix ni le taux n'ont bougé", async () => {
    const same = snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]);
    await push(same);
    await push(same);

    expect(await ctx.prisma.catalogPriceHistory.count()).toBe(1);
  });

  /** L'histoire commence quand on l'écrit — avant, il n'y a rien à affirmer. */
  it("ne rend rien avant sa propre première trace", async () => {
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));
    const startsAt = await history().startsAt();
    expect(startsAt).not.toBeNull();

    const before = new Date((startsAt?.getTime() ?? 0) - 1_000);
    expect((await history().pricingAt(before)).size).toBe(0);
  });
});

/**
 * E2E de la **vitrine publique** — la seule surface catalogue servie sans jeton.
 *
 * Ce qu'aucun test unitaire ne prouverait : ce qui franchit réellement la
 * frontière. La vue est neuve et étroite à dessein, et un champ ajouté par
 * mégarde serait public le jour du déploiement — d'où un test qui énumère les
 * clés au lieu de vérifier celles qu'il attend.
 */
import type { ShopCatalogueView, ShopQuoteView } from "@lfd/contracts";
import request from "supertest";

import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { CATEGORY, snapshotOf } from "./catalog-ingest-fixtures.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Cette suite décrit ce qu'une vitrine montre : elle part d'un catalogue vide
  // pour que le semis du harnais ne se mêle pas à ce qu'elle sème elle-même.
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
});

const SHOT = {
  url: "https://media.example/croissant.jpg",
  alt: "Un croissant doré",
  width: 800,
  height: 800,
};

function push(products: Parameters<typeof snapshotOf>[0]) {
  return ctx.app.get(B2bCatalogDriver).send(snapshotOf(products), {
    revisionId: "rev_shop",
    fingerprint: "empreinte-shop",
  });
}

/** Sans jeton : c'est tout l'objet de cette route. */
const shop = () => request(ctx.app.getHttpServer()).get("/shop/catalogue");

/**
 * La vitrine, **typée**.
 *
 * `supertest` rend un corps `any`, et un `any` qui circule dans un test laisse
 * la vue dériver sans que rien ne rougisse : un champ renommé au contrat ne
 * casserait que l'assertion qui le nomme, pas les autres.
 */
async function catalogue(): Promise<ShopCatalogueView> {
  const response = await shop();
  return response.body as ShopCatalogueView;
}

describe("la vitrine publique", () => {
  it("répond SANS jeton — on visite avant de s'identifier", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);

    const { status } = await shop();

    expect(status).toBe(200);
    expect((await catalogue()).items).toHaveLength(1);
  });

  it("rend la ligne de vitrine et le packshot reçus du référentiel", async () => {
    await push([
      { sku: "VIE-001", priceMillicents: 140_000, note: "Tourage patient", image: SHOT },
    ]);

    expect((await catalogue()).items[0]).toMatchObject({
      name: "Produit VIE-001",
      note: "Tourage patient",
      image: SHOT,
      unitPriceMillicents: 140_000,
      vatRatePercent: 5.5,
      shelfId: CATEGORY.id,
      isFeatured: false,
    });
  });

  /**
   * 🔴 **Le SKU du PRODUIT, jamais celui de la déclinaison.** C'est celui
   * qu'acceptent la commande et le devis, et celui qui est écrit dans les
   * commandes passées. Servir `VIE-001-1` ici rendrait un panier que la caisse
   * refuse.
   */
  it("expose le SKU du PRODUIT, celui que la caisse accepte", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);

    expect((await catalogue()).items[0]?.sku).toBe("VIE-001");
  });

  /**
   * 🔴 **Ce qui ne franchit PAS la frontière.** Le miroir porte le prix reçu À
   * CÔTÉ du prix décidé, qui a décidé et quand, la date de réception, l'aveu
   * qu'une liste d'allergènes est amputée. L'écart entre les deux prix EST la
   * négociation : un visiteur anonyme n'a rien à en savoir.
   *
   * Les clés sont ÉNUMÉRÉES et non vérifiées une à une : un champ ajouté par
   * mégarde à la vue serait public le jour du déploiement, et seul un test qui
   * compte les clés l'attrape.
   */
  it("ne laisse passer que ce qu'une vitrine montre", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);

    const body = await catalogue();
    expect(Object.keys(body).sort()).toEqual(["items", "shelves"]);
    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual([
      "image",
      "isFeatured",
      "name",
      "note",
      "shelfId",
      "sku",
      "unitPriceMillicents",
      "vatRatePercent",
    ]);
    expect(Object.keys(body.shelves[0] ?? {}).sort()).toEqual(["id", "name", "position"]);
  });

  it("sert le prix DÉCIDÉ ici quand il y en a un, pas celui du référentiel", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-001-1", priceMillicents: 120_000, decidedBy: "cecile" },
    });

    const body = await catalogue();
    expect(body.items[0]?.unitPriceMillicents).toBe(120_000);
    // Et le prix du référentiel ne suit pas : l'écart est la négociation.
    expect(JSON.stringify(body)).not.toContain("140000");
  });

  it("ne montre pas un article masqué", async () => {
    await push([
      { sku: "VIE-001", priceMillicents: 140_000 },
      { sku: "VIE-002", priceMillicents: 160_000 },
    ]);
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-002-1", isHidden: true },
    });

    expect((await catalogue()).items.map((item) => item.sku)).toEqual(["VIE-001"]);
  });

  /**
   * 🔴 **Ce test disait l'inverse jusqu'au 2026-09-06**, et il documentait un
   * défaut comme une règle : « le lecteur retombe sur le taux de sa famille tant
   * que tous les articles n'ont pas reçu le leur ». C'était le repli de
   * transition de `billableRate`, dont la note annonçait elle-même le retrait.
   *
   * Un article sans taux PROPRE n'est pas vendable, quoi que porte sa famille.
   * L'héritage a bien lieu — mais dans le PIM, à la projection, une fois par
   * push et tracé. Le rejouer ici à chaque facturation, contre la copie miroir
   * de la famille, faisait facturer un taux que personne n'avait posé sur cet
   * article et que rien ne signalait.
   *
   * La famille de ce test EST réglée (`CATEGORY.vatRatePercent`) : c'est
   * exactement le cas que l'ancien repli couvrait, et celui-ci le refuse.
   */
  it("ne vend pas un article sans taux, même quand sa famille en a un", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000, vatRatePercent: null }]);

    const body = await catalogue();
    expect(body.items).toEqual([]);
  });

  it("ne montre pas un article retiré du référentiel", async () => {
    await push([
      { sku: "VIE-001", priceMillicents: 140_000 },
      { sku: "VIE-002", priceMillicents: 160_000 },
    ]);
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);

    expect((await catalogue()).items.map((item) => item.sku)).toEqual(["VIE-001"]);
  });

  /**
   * Un rayon vide n'est pas une famille de moins au catalogue : c'est une
   * pastille sur laquelle un client clique pour ne rien voir.
   */
  it("ne range que les rayons réellement peuplés", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);

    const body = await catalogue();
    expect(body.shelves).toEqual([{ id: CATEGORY.id, name: CATEGORY.name, position: 0 }]);
  });

  it("rend une vitrine vide sans tomber, quand rien n'est en vente", async () => {
    const { status } = await shop();

    expect(status).toBe(200);
    expect(await catalogue()).toEqual({ shelves: [], items: [] });
  });
});

/**
 * **La vitrine tarife** — le rayon annonce ce que la caisse facturera.
 *
 * Elle a servi le prix **canonique** jusqu'au 2026-09-09 : une promotion
 * publique était invisible au rayon et n'apparaissait qu'au panier. L'écart
 * était dans le sens agréable — 2,00 € affiché, 1,80 € facturé — donc personne
 * ne réclamait ; mais **une promotion qu'on ne voit pas ne fait pas vendre**.
 * C'est un trou commercial, pas une divergence d'écran (R22).
 */
describe("la vitrine publique sert le prix RÉSOLU", () => {
  /**
   * Une règle posée en direct.
   *
   * `ctx.reset()` vide le cache des matériaux (`e2e-harness.ts`), donc un semis
   * direct est vu par la lecture suivante — sans quoi ces cas passeraient au
   * vert sur les matériaux du test d'avant.
   */
  function seedRule(over: {
    id: string;
    direction: "increase" | "decrease";
    bp: number;
  }): Promise<unknown> {
    return ctx.prisma.priceRule.create({
      data: {
        id: over.id,
        stage: "promotion",
        nature: "alter",
        scopeType: "global",
        scopeId: null,
        // 🔴 `all` : c'est TOUT le sujet. Une promotion publique ne demande
        // aucun client, et `matchesAudience` la rend applicable à un visiteur.
        audienceType: "all",
        audienceId: null,
        minQuantity: null,
        direction: over.direction,
        mode: "percent",
        value: over.bp,
        validFrom: new Date("2020-01-01T00:00:00.000Z"),
        validTo: null,
        label: over.id,
        stacksOverMercuriale: false,
        createdBy: "e2e",
      },
    });
  }

  /**
   * Régression R22 : la promotion publique n'apparaissait qu'au panier.
   *
   * Le rayon servait `unitPriceMillicents` du miroir — le canonique, jamais
   * résolu — parce qu'une justification du contrat affirmait « elle est
   * publique, donc sans client ». Un prix NÉGOCIÉ exige un client ; une
   * promotion publique, non (fix 2026-09-09).
   */
  it("🔴 montre la promotion au rayon, et barre le tarif", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 200_000 }]);
    await seedRule({ id: "promo_publique", direction: "decrease", bp: 1_000 });

    const body = await catalogue();

    expect(body.items[0]?.unitPriceMillicents).toBe(180_000);
    expect(body.items[0]?.catalogPriceMillicents).toBe(200_000);
  });

  /**
   * 🔴 **Barré seulement vers le BAS.**
   *
   * Un prix résolu peut monter au-dessus du tarif — une altération `increase`,
   * une règle `replace` posée plus haut, ou un plancher qui relève. Sur le
   * prédicat « les deux diffèrent », la vitrine aurait barré le prix le plus
   * BAS et affiché une référence mensongère sur une page publique. Le prix servi
   * suit dans les deux sens ; la rature, elle, exige une baisse.
   */
  it("🔴 ne barre RIEN quand le prix résolu monte", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 200_000 }]);
    await seedRule({ id: "supplement", direction: "increase", bp: 1_000 });

    const body = await catalogue();

    expect(body.items[0]?.unitPriceMillicents).toBe(220_000);
    expect(body.items[0]?.catalogPriceMillicents).toBeUndefined();
  });

  /**
   * **La parité, et c'est elle qui vaut le lot.** Ce que le rayon annonce est ce
   * que le devis chiffre — deux routes, un seul fabricant de prix. Tant qu'elles
   * en avaient deux, l'une a oublié ce que l'autre faisait.
   */
  it("annonce au rayon le prix que le devis chiffre", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 200_000 }]);
    await seedRule({ id: "promo_parite", direction: "decrease", bp: 1_000 });

    const rayon = (await catalogue()).items[0]?.unitPriceMillicents;
    const devis = jsonBody<ShopQuoteView>(
      await request(ctx.app.getHttpServer())
        .post("/shop/quote")
        .send({ lines: [{ sku: "VIE-001", quantity: 1 }], fulfillment: null })
        .expect(200),
    );

    expect(rayon).toBe(180_000);
    expect(devis.lines[0]?.unitPriceMillicents).toBe(rayon);
  });
});

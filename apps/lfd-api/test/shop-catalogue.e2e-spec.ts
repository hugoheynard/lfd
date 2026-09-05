/**
 * E2E de la **vitrine publique** — la seule surface catalogue servie sans jeton.
 *
 * Ce qu'aucun test unitaire ne prouverait : ce qui franchit réellement la
 * frontière. La vue est neuve et étroite à dessein, et un champ ajouté par
 * mégarde serait public le jour du déploiement — d'où un test qui énumère les
 * clés au lieu de vérifier celles qu'il attend.
 */
import request from "supertest";

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

describe("la vitrine publique", () => {
  it("répond SANS jeton — on visite avant de s'identifier", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);

    const { status, body } = await shop();

    expect(status).toBe(200);
    expect(body.items).toHaveLength(1);
  });

  it("rend la ligne de vitrine et le packshot reçus du référentiel", async () => {
    await push([
      { sku: "VIE-001", priceMillicents: 140_000, note: "Tourage patient", image: SHOT },
    ]);

    expect((await shop()).body.items[0]).toMatchObject({
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

    expect((await shop()).body.items[0].sku).toBe("VIE-001");
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

    const { body } = await shop();
    expect(Object.keys(body).sort()).toEqual(["items", "shelves"]);
    expect(Object.keys(body.items[0]).sort()).toEqual([
      "image",
      "isFeatured",
      "name",
      "note",
      "shelfId",
      "sku",
      "unitPriceMillicents",
      "vatRatePercent",
    ]);
    expect(Object.keys(body.shelves[0]).sort()).toEqual(["id", "name", "position"]);
  });

  it("sert le prix DÉCIDÉ ici quand il y en a un, pas celui du référentiel", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-001-1", priceMillicents: 120_000, decidedBy: "cecile" },
    });

    const { body } = await shop();
    expect(body.items[0].unitPriceMillicents).toBe(120_000);
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

    expect((await shop()).body.items.map((item: { sku: string }) => item.sku)).toEqual(["VIE-001"]);
  });

  /**
   * Un article qu'on ne sait pas facturer ne se vend pas — mais « sans taux »
   * ne veut pas dire « sans taux SUR L'ARTICLE » : le lecteur retombe sur celui
   * de sa famille tant que tous les articles n'ont pas reçu le leur. Ce test dit
   * la règle réelle, pas celle qu'on aurait pu croire.
   *
   * L'exclusion demande donc que les DEUX manquent, ce qu'aucune vitrine ne
   * verra tant qu'une famille est réglée.
   */
  it("retombe sur le taux de la famille quand l'article n'en porte pas", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000, vatRatePercent: null }]);

    const { body } = await shop();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].vatRatePercent).toBe(CATEGORY.vatRatePercent);
  });

  it("ne montre pas un article retiré du référentiel", async () => {
    await push([
      { sku: "VIE-001", priceMillicents: 140_000 },
      { sku: "VIE-002", priceMillicents: 160_000 },
    ]);
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);

    expect((await shop()).body.items.map((item: { sku: string }) => item.sku)).toEqual(["VIE-001"]);
  });

  /**
   * Un rayon vide n'est pas une famille de moins au catalogue : c'est une
   * pastille sur laquelle un client clique pour ne rien voir.
   */
  it("ne range que les rayons réellement peuplés", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);

    const { body } = await shop();
    expect(body.shelves).toEqual([{ id: CATEGORY.id, name: CATEGORY.name, position: 0 }]);
  });

  it("rend une vitrine vide sans tomber, quand rien n'est en vente", async () => {
    const { status, body } = await shop();

    expect(status).toBe(200);
    expect(body).toEqual({ shelves: [], items: [] });
  });
});

/**
 * **Le lot qui connaît ses articles.**
 *
 * ## Ce que cette suite éprouve, et que rien d'autre ne couvre
 *
 * La promesse centrale de la porte : *un SKU que le lot n'a pas chargé est
 * refusé*. Elle n'était vérifiée nulle part — `ArticleNotInLotError` n'était
 * levé par aucun test au 2026-09-09, alors que c'est elle qui distingue la porte
 * du tarificateur nu qu'elle remplace.
 *
 * Ce que le refus empêche, précisément : avant le lot, `LoadedPricer` ne savait
 * pas pour quels articles il avait été chargé, et `pricer.price(autreArticle, n)`
 * rendait un **prix plausible**. Correct pour les matériaux par accident du
 * cache — qui garde les tables entières —, et **faux pour les preuves** : un
 * article hors lot n'a ni ratio de volume ni cumul mesurés, donc porte fermée et
 * cumul sous-compté. Rien ne le signalait.
 *
 * ## Sans base ni doublé de port
 *
 * Le lot est pur : on lui donne un tarificateur et des articles, il répond. Les
 * matériaux sont des valeurs. C'est ce qui permet d'éprouver le refus en
 * énumérant des cas plutôt qu'en montant un environnement.
 */
import { catalogueArticle } from "../../../catalog/domain/catalogue-article.js";
import { LoadedPricer } from "../../domain/loaded-pricer.js";
import { materialsOf, NO_EVIDENCE } from "../../domain/pricing-materials.js";
import type { PriceRule } from "../../domain/price-rule.js";
import { ArticleNotInLotError, PricedLot } from "../priced-lot.js";

const AT = new Date("2026-06-15T09:00:00.000Z");

const CROISSANT = catalogueArticle({
  sku: "VIE-001",
  name: "Croissant au beurre",
  category: "viennoiserie",
  unitPriceMillicents: 200_000,
});

const PAIN = catalogueArticle({
  sku: "PAI-001",
  name: "Baguette",
  category: "pain",
  unitPriceMillicents: 100_000,
});

/** Un barème qui s'ouvre à 10 pièces, sur tout le catalogue. */
const VOLUME_10: PriceRule = {
  id: "vol_10",
  stage: "volume",
  scope: { type: "global", id: null },
  audience: { type: "all", id: null },
  minQuantity: 10,
  label: "10+ à −20 %",
  stacksOverMercuriale: false,
  nature: "alter",
  alteration: { direction: "decrease", mode: "percent", bp: 2_000 },
  validFrom: new Date("2020-01-01T00:00:00.000Z"),
  validTo: null,
  suspendedFrom: null,
};

function lotOf(articles = [CROISSANT, PAIN], rules: readonly PriceRule[] = []): PricedLot {
  return new PricedLot(
    LoadedPricer.over(
      materialsOf({ rules, floors: [], ladders: [], commitments: [], mercuriale: null }),
      NO_EVIDENCE,
      { companyId: null },
      AT,
    ),
    articles,
  );
}

describe("le lot répond pour ce qu'il a chargé", () => {
  it("rend le prix d'un article du lot, à sa quantité", () => {
    expect(lotOf().price("VIE-001", 1).finalMillicents).toBe(200_000);
  });

  it("lit la quantité : le barème ne s'ouvre qu'au dixième article", () => {
    const lot = lotOf([CROISSANT], [VOLUME_10]);

    expect(lot.price("VIE-001", 9).finalMillicents).toBe(200_000);
    expect(lot.price("VIE-001", 10).finalMillicents).toBe(160_000);
  });

  /**
   * L'ordre demandé, et non celui du chargement : un écran qui reçoit ses lignes
   * dans un autre ordre que celui qu'il a demandé les réattribue de travers, et
   * personne ne compte les lignes avant de les lire.
   */
  it("rend les articles dans l'ordre DEMANDÉ", () => {
    const priced = lotOf().all([
      { sku: "PAI-001", quantity: 1 },
      { sku: "VIE-001", quantity: 1 },
    ]);

    expect(priced.map((article) => article.sku)).toEqual(["PAI-001", "VIE-001"]);
  });

  it("résout chaque article à SA quantité", () => {
    const priced = lotOf([CROISSANT, PAIN], [VOLUME_10]).all([
      { sku: "VIE-001", quantity: 10 },
      { sku: "PAI-001", quantity: 1 },
    ]);

    expect(priced.map((article) => article.finalMillicents)).toEqual([160_000, 100_000]);
  });
});

describe("🔴 un SKU hors lot est REFUSÉ", () => {
  /**
   * Le cœur du lot. Rendre un prix ici serait rendre un chiffre **plausible** :
   * les matériaux couvrent l'article par accident du cache, mais ses preuves —
   * ratio de volume, cumul d'engagement — n'ont pas été mesurées pour lui. Porte
   * de plancher fermée, cumul sous-compté, et rien pour le signaler.
   */
  it("refuse `price` sur un article qu'on n'a pas chargé", () => {
    expect(() => lotOf([CROISSANT]).price("PAI-001", 1)).toThrow(ArticleNotInLotError);
  });

  it("refuse aussi `tiers` et `projectAt` — le refus ne dépend pas de la question", () => {
    const lot = lotOf([CROISSANT]);

    expect(() => lot.tiers("PAI-001", 1)).toThrow(ArticleNotInLotError);
    expect(() => lot.projectAt("PAI-001", 1_000)).toThrow(ArticleNotInLotError);
  });

  /**
   * Le message porte le SKU **et** le nombre d'articles chargés : sur un lot de
   * quatre-vingt-douze pièces, « lequel manque » est la seule question qu'on se
   * pose, et « combien y en a-t-il » dit tout de suite si le lot est celui qu'on
   * croyait.
   */
  it("dit lequel manque, et combien le lot en porte", () => {
    let raised: ArticleNotInLotError | null = null;
    try {
      lotOf([CROISSANT, PAIN]).price("CHO-001", 1);
    } catch (error) {
      raised = error instanceof ArticleNotInLotError ? error : null;
    }

    expect(raised?.sku).toBe("CHO-001");
    expect(raised?.loaded).toEqual(["VIE-001", "PAI-001"]);
    expect(raised?.message).toContain("2 article(s) chargé(s)");
  });

  /** Le refus vaut aussi au milieu d'un lot : `all` ne raccourcit pas la liste. */
  it("échoue en ENTIER plutôt que de rendre les lignes qu'il connaît", () => {
    expect(() =>
      lotOf([CROISSANT]).all([
        { sku: "VIE-001", quantity: 1 },
        { sku: "PAI-001", quantity: 1 },
      ]),
    ).toThrow(ArticleNotInLotError);
  });
});

import { CatalogItem, type PimFacts } from "../entities/catalog-item.js";
import { CatalogVersion } from "../entities/catalog-version.js";

/**
 * Ce que ces cas tiennent : une version est une **photographie complète**, au
 * prix **reçu**, et **immuable** — les trois propriétés dont dépend le fait
 * qu'on puisse encore lui faire confiance dans deux ans.
 */

function facts(sku: string, over: Partial<PimFacts> = {}): PimFacts {
  return {
    sku,
    productId: `p_${sku}`,
    productSku: sku,
    name: sku,
    kind: "daily",
    categoryId: "cat_vien",
    priceMillicents: 210_000,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    allergens: null,
    allergenLabels: null,
    receivedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  };
}

function photograph(mirror: readonly CatalogItem[], excludedSkus: readonly string[] = []) {
  return CatalogVersion.photograph({
    id: "cver_1",
    deliveryId: "d_1",
    revisionId: "rev_1",
    fingerprint: "empreinte-A",
    excludedSkus,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: "staff_1",
    mirror,
  });
}

describe("CatalogVersion.photograph", () => {
  it("prend une ligne par article du miroir", () => {
    const version = photograph([
      CatalogItem.receive(facts("VIE-001-1")),
      CatalogItem.receive(facts("PAT-002-1")),
    ]);

    expect(version.lineCount).toBe(2);
  });

  /**
   * 🔴 Le prix **REÇU**, jamais l'effectif. Une version est immuable après pose,
   * tandis que le prix effectif bouge sans qu'aucune livraison n'arrive — un
   * commercial renégocie. Y inscrire l'effectif donnerait une archive fausse dès
   * la première renégociation, et fausse pour toujours.
   */
  it("archive le prix du PIM, pas le prix négocié", () => {
    const item = CatalogItem.receive(facts("VIE-001-1", { priceMillicents: 210_000 }));
    item.setB2bPrice(180_000, "staff_1");
    expect(item.effectivePriceMillicents).toBe(180_000);

    const version = photograph([item]);

    expect(version.factsFor("VIE-001-1")?.priceMillicents).toBe(210_000);
  });

  /**
   * Deux versions d'un catalogue identique doivent se comparer ligne à ligne.
   * Sans tri à la pose, l'ordre serait celui que la base a rendu ce jour-là —
   * et deux archives identiques se liraient comme deux archives différentes.
   */
  it("trie les lignes par SKU, quel que soit l’ordre du miroir", () => {
    const version = photograph([
      CatalogItem.receive(facts("VIE-002-1")),
      CatalogItem.receive(facts("PAT-001-1")),
      CatalogItem.receive(facts("CHO-003-1")),
    ]);

    expect(version.lines.map((line) => line.sku)).toEqual(["CHO-003-1", "PAT-001-1", "VIE-002-1"]);
  });

  /**
   * Un agrégat ne partage pas son état : muter la liste passée après coup
   * réécrirait une archive, c'est-à-dire exactement ce qu'une archive interdit.
   */
  it("ne partage pas la liste des SKU écartés avec l’appelant", () => {
    const excluded = ["VIE-001-1"];
    const version = photograph([CatalogItem.receive(facts("VIE-001-1"))], excluded);

    excluded.push("PAT-002-1");

    expect(version.excludedSkus).toEqual(["VIE-001-1"]);
  });

  it("porte l’ancre, l’empreinte et l’auteur de la validation", () => {
    const version = photograph([CatalogItem.receive(facts("VIE-001-1"))]);

    expect(version.toPersistence()).toMatchObject({
      id: "cver_1",
      deliveryId: "d_1",
      revisionId: "rev_1",
      fingerprint: "empreinte-A",
      createdBy: "staff_1",
    });
  });

  /**
   * Le cas limite du §7.3, et il tombe juste : un catalogue peut être vide (tout
   * a été retiré). Refuser la pose obligerait à choisir entre ne pas archiver ce
   * geste-là et inventer une ligne.
   */
  it("accepte un catalogue vide plutôt que d’inventer une ligne", () => {
    expect(photograph([]).lineCount).toBe(0);
  });

  it("rend `null` pour un SKU qui n’était pas au catalogue", () => {
    const version = photograph([CatalogItem.receive(facts("VIE-001-1"))]);

    expect(version.factsFor("PAT-002-1")).toBeNull();
  });
});

describe("CatalogVersion.reconstitute", () => {
  it("rend le même état que celui qu’on lui donne", () => {
    const state = photograph([CatalogItem.receive(facts("VIE-001-1"))]).toPersistence();

    expect(CatalogVersion.reconstitute(state).toPersistence()).toEqual(state);
  });
});

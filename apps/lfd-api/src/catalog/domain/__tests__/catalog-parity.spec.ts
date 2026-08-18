import { compareCatalogs, type ReceivedEntry, type SeedEntry } from "../catalog-parity.js";

/**
 * Ce que ces tests éprouvent : que la comparaison **voit** les écarts qui
 * coûteraient de l'argent, et qu'elle ne fabrique pas de faux écart là où seul
 * le SKU a changé de forme. Un comparateur qui crie au loup sur 92 lignes est
 * aussi inutile qu'un comparateur muet — on cesse de le lire.
 */

function seed(over: Partial<SeedEntry> = {}): SeedEntry {
  return {
    sku: "VIE-001",
    name: "Croissant",
    unitPriceCents: 200,
    vatRate: 5.5,
    ...over,
  };
}

function received(over: Partial<ReceivedEntry> = {}): ReceivedEntry {
  return {
    sku: "VIE-001-1",
    productSku: "VIE-001",
    isDefault: true,
    name: "Croissant",
    unitPriceCents: 200,
    vatRate: 5.5,
    ...over,
  };
}

describe("compareCatalogs", () => {
  /**
   * LE test de ce fichier. Le PIM dérive le SKU d'une déclinaison de celui de
   * son produit ; comparer les `sku` bruts rendrait 92 disparitions et 92
   * apparitions, et le rapport deviendrait illisible au moment précis où il doit
   * décider d'une bascule.
   */
  it("rapproche par SKU produit, pas par SKU de déclinaison", () => {
    const report = compareCatalogs([seed()], [received()]);

    expect(report.identical).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.extra).toEqual([]);
  });

  it("signale un prix qui change, avec les DEUX montants", () => {
    const report = compareCatalogs([seed()], [received({ unitPriceCents: 220 })]);

    expect(report.priceGaps).toEqual([{ sku: "VIE-001", seed: 200, received: 220 }]);
    expect(report.identical).toBe(false);
  });

  /**
   * L'écart le plus attendu de tous : le seed code la TVA à 5,5 % pour tout, y
   * compris le non-alimentaire. Le voir n'est pas une alerte, c'est la
   * confirmation que faire voyager le taux servait à quelque chose.
   */
  it("signale un taux de TVA qui change", () => {
    const report = compareCatalogs([seed()], [received({ vatRate: 20 })]);

    expect(report.vatGaps).toEqual([{ sku: "VIE-001", seed: 5.5, received: 20 }]);
  });

  it("signale un nom qui change", () => {
    const report = compareCatalogs([seed()], [received({ name: "Croissant pur beurre" })]);

    expect(report.nameGaps).toEqual([
      { sku: "VIE-001", seed: "Croissant", received: "Croissant pur beurre" },
    ]);
  });

  /**
   * Le pire cas, et la raison d'être de cette comparaison : après la bascule, un
   * client qui commande ce SKU verrait son panier refusé.
   */
  it("signale un article vendu aujourd'hui que le PIM ne pousse pas", () => {
    const report = compareCatalogs([seed(), seed({ sku: "PAI-001" })], [received()]);

    expect(report.missing).toEqual(["PAI-001"]);
    expect(report.identical).toBe(false);
  });

  it("signale une nouveauté reçue que le seed ne connaît pas", () => {
    const nouveau = received({ sku: "CHO-009-1", productSku: "CHO-009" });

    const report = compareCatalogs([seed()], [received(), nouveau]);

    expect(report.extra).toEqual(["CHO-009-1"]);
  });

  /**
   * Un conditionnement (carton de 50) n'a aucun correspondant dans le seed : il
   * doit apparaître comme un article de plus, pas comme un écart de prix sur le
   * produit — sinon le rapport dirait qu'un croissant coûte soudain 60 €.
   */
  it("compte une seconde déclinaison du même produit comme un article de plus", () => {
    const carton = received({
      sku: "VIE-001-CARTON",
      productSku: "VIE-001",
      isDefault: false,
      unitPriceCents: 6000,
    });

    const report = compareCatalogs([seed()], [received(), carton]);

    expect(report.priceGaps).toEqual([]);
    expect(report.extra).toEqual(["VIE-001-CARTON"]);
  });

  it("rend les deux effectifs, pour qu'un écart de volume saute aux yeux", () => {
    const report = compareCatalogs([seed(), seed({ sku: "PAI-001" })], [received()]);

    expect(report.seedCount).toBe(2);
    expect(report.receivedCount).toBe(1);
  });

  it("un catalogue reçu vide rend TOUT manquant — et surtout pas « identique »", () => {
    const report = compareCatalogs([seed()], []);

    expect(report.missing).toEqual(["VIE-001"]);
    expect(report.identical).toBe(false);
  });
});

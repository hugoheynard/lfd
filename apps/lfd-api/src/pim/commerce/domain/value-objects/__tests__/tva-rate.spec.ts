import { InvalidTvaRateError, TvaRate } from "../tva-rate.js";

describe("TvaRate", () => {
  describe("le tag Shopify découle du taux", () => {
    it("remplace le point décimal par un tiret", () => {
      expect(TvaRate.create(5.5).tag).toBe("tva-5-5");
    });

    it("n’invente pas de décimale sur un entier", () => {
      expect(TvaRate.create(10).tag).toBe("tva-10");
      expect(TvaRate.create(20).tag).toBe("tva-20");
    });
  });

  describe("les taux impossibles sont refusés dès le domaine", () => {
    /**
     * Le cas qui motivait le VO : la route HTTP exige `positive()`, mais un
     * seed ou un import ne passe pas par elle — et `tva-NaN` serait parti chez
     * Shopify comme un handle ordinaire.
     */
    it.each([
      ["NaN", Number.NaN],
      ["l’infini", Number.POSITIVE_INFINITY],
      ["zéro", 0],
      ["un taux négatif", -5],
      ["plus de 100 %", 120],
      ["trois décimales", 5.555],
    ])("refuse %s", (_label, percent) => {
      expect(() => TvaRate.create(percent)).toThrow(InvalidTvaRateError);
    });

    it("accepte les taux français en vigueur", () => {
      for (const percent of [2.1, 5.5, 10, 20]) {
        expect(() => TvaRate.create(percent)).not.toThrow();
      }
    });

    /**
     * Les taux de Corse et d'outre-mer, qu'une chaîne alimentaire finit par
     * croiser. C'est la FAMILLE qui est testée, pas les trois taux du
     * continent.
     */
    it("accepte les taux de Corse et d’outre-mer", () => {
      for (const percent of [0.9, 1.05, 1.75, 8.5, 13]) {
        expect(() => TvaRate.create(percent)).not.toThrow();
      }
    });

    /**
     * Le piège trouvé en passe adversariale : `4.85 * 100` vaut
     * `484.99999999999994`, donc le contrôle « au plus deux décimales » écrit
     * avec une multiplication refusait un taux parfaitement légitime. Aucun
     * taux français ne vaut 4,85 — c'est bien pour ça que ça serait passé
     * inaperçu jusqu'au jour où un taux étranger y tombe.
     */
    it("n’est pas piégé par la multiplication flottante", () => {
      for (const percent of [4.85, 7.35, 12.35, 1.15, 2.95]) {
        expect(() => TvaRate.create(percent)).not.toThrow();
      }
    });
  });

  it("compare par la valeur, pas par l’instance", () => {
    expect(TvaRate.create(5.5).equals(TvaRate.create(5.5))).toBe(true);
    expect(TvaRate.create(5.5).equals(TvaRate.create(10))).toBe(false);
  });
});

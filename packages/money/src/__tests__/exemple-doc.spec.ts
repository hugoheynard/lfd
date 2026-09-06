import { ventilateVat } from "../vat.js";

/**
 * **L'exemple chiffré de `documentation/pricing/ajouter-un-terme-au-panier.md` §2.**
 *
 * Il est ici pour une raison précise : un exemple arithmétique dans un document
 * est la forme de documentation qui pourrit le plus discrètement. Une phrase
 * fausse se remarque ; un total faux se recopie. Ces cas-ci échouent le jour où
 * la ventilation change, et le document devient alors une chose à corriger
 * plutôt qu'un piège.
 *
 * Le panier : 12 croissants à 1,00 € HT (5,5 %), 4 jus à 2,00 € HT (10 %), et
 * 10,00 € HT de course (20 %).
 */
const LINES = [
  { htCents: 1200, vatRate: 5.5 },
  { htCents: 800, vatRate: 10 },
];
const COURSE = [{ htCents: 1000, vatRate: 20 }];

describe("le panier de la documentation", () => {
  it("sans remise : une part par taux, chacune arrondie une fois", () => {
    const view = ventilateVat({ lines: LINES, discountCents: 0, extras: COURSE });

    expect(view.subtotalHtCents).toBe(2000);
    expect(view.vat).toEqual([
      { rate: 5.5, amountCents: 66 },
      { rate: 10, amountCents: 80 },
      { rate: 20, amountCents: 200 },
    ]);
    expect(view.vatTotalCents).toBe(346);
    expect(view.totalCents).toBe(3346);
  });

  /**
   * 🔴 **Le cas qui montre ce que `extras` veut dire.**
   *
   * La remise de 2,00 € retire 10 % du sous-total, et chaque LIGNE est
   * proratisée sur le net : 12,00 € deviennent 10,80 €, 8,00 € deviennent
   * 7,20 €. Leur TVA baisse donc — 66 → 59 et 80 → 72.
   *
   * La course, elle, ne bouge pas : **200 dans les deux cas**. C'est toute la
   * différence entre `lines` et `extras`, et c'est ce qu'un test doit tenir —
   * l'inverse s'écrirait en déplaçant un mot, et rendrait encore un nombre
   * plausible.
   */
  it("avec remise : les lignes sont proratisées, la course ne bouge pas", () => {
    const view = ventilateVat({ lines: LINES, discountCents: 200, extras: COURSE });

    expect(view.vat).toEqual([
      { rate: 5.5, amountCents: 59 },
      { rate: 10, amountCents: 72 },
      { rate: 20, amountCents: 200 },
    ]);
    expect(view.vatTotalCents).toBe(331);
    // 18,00 € de marchandise nette + 10,00 € de course + 3,31 € de TVA.
    expect(view.totalCents).toBe(3131);
  });
});

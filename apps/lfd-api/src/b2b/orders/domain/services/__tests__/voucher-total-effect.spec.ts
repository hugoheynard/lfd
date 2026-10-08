import { voucherImputationCents } from "../voucher-imputation.js";
import { voucherTotalEffectCents } from "../voucher-total-effect.js";

/** Un panier à deux taux : 10,00 € HT à 5,5 %, et `atTwentyCents` HT à 20 %. */
function cartOf(atTwentyCents: number, voucherCents: number, discountCents = 0) {
  return {
    lines: [
      { htCents: 1_000, vatRate: 5.5 },
      { htCents: atTwentyCents, vatRate: 20 },
    ],
    discountCents: discountCents + voucherCents,
    extras: [],
  };
}

describe("voucherTotalEffectCents", () => {
  it("rend zéro sans bon", () => {
    expect(voucherTotalEffectCents(cartOf(1_000, 0), 0)).toBe(0);
  });

  it("rend la baisse TTC ventilée au prorata des deux taux, pas le HT du bon", () => {
    // 5,00 € HT répartis 2,50 / 2,50 : 7,50 × 1,055 → 7,91 et 7,50 × 1,2 → 9,00,
    // contre 10,55 + 12,00 sans le bon.
    expect(voucherTotalEffectCents(cartOf(1_000, 500), 500)).toBe(564);
  });

  it("plafonné au panier, rend tout le TTC des marchandises", () => {
    const imputed = voucherImputationCents(2_000, 1_500);
    expect(imputed).toBe(1_500);
    expect(voucherTotalEffectCents(cartOf(500, imputed), imputed)).toBe(1_655);
  });

  it("ne compte pas la remise du point de retrait dans l'effet du bon", () => {
    // Remise 2,00 € puis bon 3,00 € : l'effet est celui des 3,00 € seuls.
    const effect = voucherTotalEffectCents(cartOf(1_000, 300, 200), 300);
    // Sans le bon : 9,00 à 5,5 % → 9,50 (arrondi du taux) et 9,00 à 20 % → 10,80 ;
    // avec : 16,91 comme ci-dessus.
    expect(effect).toBe(2_030 - 1_691);
  });

  it("n'inclut pas les frais de coursier, que le bon ne paie jamais", () => {
    const withExtras = { ...cartOf(1_000, 500), extras: [{ htCents: 900, vatRate: 20 }] };
    expect(voucherTotalEffectCents(withExtras, 500)).toBe(564);
  });

  /**
   * Plan TVA des frais de port, V1 : un port qui suit la marchandise est
   * ventilé dans les DEUX passes — avec et sans le bon. Sa part se répartit
   * sur la base brute, elle ne bouge donc pas avec le bon.
   */
  describe("avec un port qui suit la marchandise", () => {
    const cart = (voucherCents: number) => ({
      lines: [
        { htCents: 2_000, vatRate: 5.5 },
        { htCents: 2_000, vatRate: 10 },
      ],
      discountCents: voucherCents,
      extras: [{ htCents: 400, followsGoods: true as const }],
    });

    it("rend la baisse TTC des seules marchandises", () => {
      // Sans : 2200 → 121 et 2200 → 220, total 4741 ; avec : 1200 → 66 et 120, total 2586.
      expect(voucherTotalEffectCents(cart(2_000), 2_000)).toBe(4_741 - 2_586);
    });

    it("reste défini quand le bon solde toute la marchandise", () => {
      // Avec : le port seul, 200 par taux → 11 et 20, total 431.
      expect(voucherTotalEffectCents(cart(4_000), 4_000)).toBe(4_741 - 431);
    });
  });
});

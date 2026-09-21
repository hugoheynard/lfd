import { proHtFromPublic, proPriceFromPublic } from "../accounting-rules.js";
import { updateVariantPricingPayloadSchema } from "../product.js";

/**
 * ⚠️ Ce fichier a porté les tests de `htFromTtc` / `htMillicentsOf` jusqu'au
 * 2026-09-21. Ils sont partis avec leur code dans `@lfd/money` ; ce qui reste
 * ici est ce qui parle vraiment du RÉFÉRENTIEL — la dérivation du prix
 * professionnel depuis l'étiquette publique, et le schéma qui la saisit.
 */

describe("proHtFromPublic", () => {
  /**
   * La chaîne entière, telle que l'écran l'affiche : 12,00 € public TTC,
   * −10 % pour les pros, 5,5 % de TVA.
   */
  it("enchaîne le rapport puis le taux", () => {
    // 12,00 € × 90 % = 10,80 € TTC ; ÷ 1,055 = 10,2369… → 10,24 € HT.
    expect(proHtFromPublic(1_200, 9_000, 5.5)).toBe(1_024);
  });

  /**
   * **L'invariant qui justifie l'ordre des arrondis** : le HT affiché, re-taxé,
   * redonne le TTC affiché. Garder le rationnel exact jusqu'au bout ferait
   * diverger d'un centime deux nombres que l'écran montre l'un sous l'autre —
   * et un client qui recompte trouverait le désaccord avant nous.
   */
  it("reste d'accord avec le prix pro TTC affiché juste au-dessus", () => {
    // La re-taxation est recalculée ICI, à la main, et non par une fonction du
    // module : un invariant vérifié avec le code qu'il surveille ne surveille
    // rien. `ttcFromHt` la portait — elle a disparu avec la saisie hors taxe,
    // et l'invariant, lui, tient toujours.
    const retaxed = (htCents: number, ratePercent: number): number =>
      Math.round((htCents * (10_000 + ratePercent * 100)) / 10_000);

    for (const publicTtc of [1_200, 199, 250, 4_999, 10_000]) {
      const proTtc = proPriceFromPublic(publicTtc, 9_000);
      const proHt = proHtFromPublic(publicTtc, 9_000, 5.5);
      expect(proHt).not.toBeNull();
      expect(retaxed(proHt ?? 0, 5.5)).toBe(proTtc);
    }
  });

  it("refuse de dériver sans taux", () => {
    expect(proHtFromPublic(1_200, 9_000, null)).toBeNull();
  });
});

/**
 * **La porte d'entrée, fermée.** Un seul système est valide : le prix se saisit
 * TTC, le hors taxe se dérive.
 *
 * Le champ `priceBasis` a disparu du contrat, et ce cas est là pour que sa
 * disparition soit un FAIT testé plutôt qu'une absence. Un jour quelqu'un
 * voudra rouvrir la porte ; il tombera d'abord ici.
 */
describe("updateVariantPricingPayloadSchema — une seule assiette", () => {
  it("n'attend plus qu'un prix et un poids : le prix EST un prix public TTC", () => {
    expect(
      updateVariantPricingPayloadSchema.parse({ priceCents: 1_000, weightGrams: null }),
    ).toEqual({ priceCents: 1_000, weightGrams: null });
  });
});

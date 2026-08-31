import { proHtFromPublic, proPriceFromPublic } from "../accounting-rules.js";
import { htFromTtc, htMillicentsOf } from "../tax.js";
import { updateVariantPricingPayloadSchema } from "../product.js";

describe("htFromTtc", () => {
  it("déduit le hors taxe d'un prix d'étiquette", () => {
    // 1,20 € TTC à 5,5 % → 1,137… €, donc 1,14 € une fois arrondi.
    expect(htFromTtc(120, 5.5)).toBe(114);
    expect(htFromTtc(120, 10)).toBe(109);
    expect(htFromTtc(1_200, 20)).toBe(1_000);
  });

  /**
   * **C'est tout l'objet du chantier** : un prix d'étiquette unique, traversé
   * par deux taux, donne deux hors taxe. Le croissant est à 1,20 € qu'on
   * l'emporte ou qu'on le mange en salle.
   */
  it("donne deux HT différents pour un même TTC selon le taux", () => {
    expect(htFromTtc(120, 5.5)).not.toBe(htFromTtc(120, 10));
  });

  /**
   * `5.5 * 100` vaut `550.0000000000001` en binaire, et `4.85 * 100` vaut
   * `484.99999999999994`. Un taux à deux décimales doit passer par l'entier
   * avant de diviser — le référentiel a déjà payé ce piège une fois, dans
   * `VatPercent`.
   */
  it("ne se fait pas piéger par un taux à deux décimales", () => {
    expect(htFromTtc(10_485, 4.85)).toBe(10_000);
  });

  it("laisse un prix inchangé à taux nul", () => {
    expect(htFromTtc(1_234, 0)).toBe(1_234);
  });
});

describe("htMillicentsOf", () => {
  /**
   * Le cran de précision qui évite qu'une division se paie à la quantité : le
   * hors taxe d'un prix d'étiquette ne tombe presque jamais juste, et
   * l'arrondir au centime ici multiplierait l'erreur par ce qui est commandé.
   */
  it("garde les décimales que la division crée", () => {
    // 1,20 € TTC à 5,5 % → 1,13744… € : 113 744 millicentimes.
    expect(htMillicentsOf(120, 5.5)).toBe(113_744);
  });

  it("reste d'accord avec le centime au moment de l'arrondir", () => {
    for (const ttc of [120, 250, 999, 1_200]) {
      const millicents = htMillicentsOf(ttc, 5.5);
      expect(millicents).not.toBeNull();
      expect(Math.round((millicents ?? 0) / 1_000)).toBe(htFromTtc(ttc, 5.5));
    }
  });

  /**
   * Refus, pas repli : inventer un taux ferait facturer un montant que personne
   * n'a décidé. Le référentiel a déjà retiré un défaut de ce genre
   * (`DEFAULT_FOOD_VAT_RATE`).
   */
  it("refuse de dériver sans taux", () => {
    expect(htMillicentsOf(120, null)).toBeNull();
  });
});

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

import { cartAdjustmentCents } from "@lfd/contracts";
import { percentOf } from "@lfd/money";

/**
 * **Deux règles d'arrondi d'un pourcentage, une seule réponse** — plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 5, § 9 bis).
 *
 * `percentOf` (`@lfd/money`, en entiers) arrondit la remise et les frais en
 * pourcentage d'une commande de particulier ; `cartAdjustmentCents`
 * (`@lfd/contracts`) ceux du pro, du devis et de la garde. Le doublon est
 * assumé parce que `@lfd/money` ne dépend de rien ; il n'est tenable que s'ils
 * rendent la même chose, et l'API est le seul endroit qui voit les deux.
 */
const RATES_BP = [
  0, 1, 5, 50, 250, 333, 500, 550, 750, 999, 1_000, 1_250, 2_000, 3_333, 5_000, 9_999, 10_000,
];

describe("percentOf (@lfd/money) ≡ cartAdjustmentCents (@lfd/contracts)", () => {
  it.each(RATES_BP)("rend le même nombre de centimes à %p pb, de 0 à 20 000 c", (bp) => {
    for (let base = 0; base <= 20_000; base += 1) {
      const expected = cartAdjustmentCents({ mode: "percent", bp }, base);
      if (percentOf(BigInt(base), bp) !== expected) {
        throw new Error(`${String(bp)} pb sur ${String(base)} c : ${String(expected)} attendu`);
      }
    }
  });

  it("rend le même nombre sur les grands paniers, demi-centimes compris", () => {
    const halves = [5, 15, 25, 105, 2_005, 199_995, 200_000, 1_234_567];
    for (const base of halves) {
      for (const bp of RATES_BP) {
        expect(percentOf(BigInt(base), bp)).toBe(
          cartAdjustmentCents({ mode: "percent", bp }, base),
        );
      }
    }
  });

  it("arrondit la moitié vers le haut : −10 % de 6,66 € = 0,67 €", () => {
    expect(percentOf(666n, 1_000)).toBe(67);
    expect(cartAdjustmentCents({ mode: "percent", bp: 1_000 }, 666)).toBe(67);
  });
});

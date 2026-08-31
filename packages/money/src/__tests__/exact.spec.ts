import {
  addCents,
  compareExact,
  divideByBasisPoints,
  fractionByBasisPoints,
  fromCents,
  roundToCents,
  scaleByBasisPoints,
} from "../exact.js";

describe("l'arithmétique exacte", () => {
  it("n'arrondit qu'à la sortie, jamais entre deux opérations", () => {
    // −20 % puis −10 % font −28 %, pas −30 % : la composition doit survivre au
    // trajet sans qu'un arrondi intermédiaire la fausse.
    const chained = scaleByBasisPoints(scaleByBasisPoints(fromCents(1_000), 2_000, -1), 1_000, -1);
    expect(roundToCents(chained)).toBe(720);
  });

  it("arrondit au plus proche, la moitié s'éloignant de zéro", () => {
    // 2,345 € donne 2,35 € — l'arrondi commercial. L'arrondi « au pair » de
    // l'IEEE rendrait 2,34 € une fois sur deux : correct statistiquement,
    // indéfendable devant un client qui recompte.
    expect(roundToCents({ num: 2_345n, den: 10n })).toBe(235);
    expect(roundToCents({ num: -2_345n, den: 10n })).toBe(-235);
  });

  it("prend une fraction, ce qui n'est pas altérer d'autant", () => {
    expect(roundToCents(fractionByBasisPoints(fromCents(1_000), 9_000))).toBe(900);
    expect(roundToCents(scaleByBasisPoints(fromCents(1_000), 9_000, -1))).toBe(100);
  });

  it("additionne et compare", () => {
    expect(roundToCents(addCents(fromCents(100), 25, 1))).toBe(125);
    expect(compareExact(fromCents(100), fromCents(200))).toBeLessThan(0);
    expect(compareExact(fromCents(200), fromCents(200))).toBe(0);
  });
});

describe("divideByBasisPoints", () => {
  it("rend le hors taxe d'un prix TTC", () => {
    // 12,00 € TTC à 20 % → 10,00 € HT.
    expect(roundToCents(divideByBasisPoints(fromCents(1_200), 12_000))).toBe(1_000);
  });

  /**
   * Le point de tout le module : la division reste exacte tant qu'on ne
   * demande pas de centimes. Multiplier par un ratio PUIS diviser par un taux
   * ne perd rien en chemin.
   */
  it("compose avec une fraction sans perdre en chemin", () => {
    const proHt = divideByBasisPoints(fractionByBasisPoints(fromCents(1_200), 9_000), 10_550);
    // 12,00 € × 90 % = 10,80 € TTC ; ÷ 1,055 = 10,2369… € → 10,24 €.
    expect(roundToCents(proHt)).toBe(1_024);
  });

  /**
   * Un dénominateur nul rendrait un rationnel que `roundToCents` changerait en
   * `NaN` — un prix faux plutôt qu'une panne. Mieux vaut la panne.
   */
  it("refuse de diviser par zéro plutôt que de rendre un prix faux", () => {
    expect(() => divideByBasisPoints(fromCents(100), 0)).toThrow(RangeError);
  });
});

import {
  centsFromMillicents,
  lineTotalCents,
  millicentsFromCents,
  roundToMillicents,
} from "../millicents.js";
import { divideByBasisPoints, fromCents } from "../exact.js";

/** Le hors taxe d'un article à 9,00 € TTC à 10 %, en millicentimes : 818 182. */
const PRO_HT_MILLICENTS = roundToMillicents(divideByBasisPoints(fromCents(900), 11_000));

describe("le millicentime", () => {
  it("garde les décimales qu'un centime jetterait", () => {
    // 900 / 1,10 = 818,1818… centimes. Le centime en garde 818, le
    // millicentime 818,182.
    expect(PRO_HT_MILLICENTS).toBe(818_182);
    expect(centsFromMillicents(PRO_HT_MILLICENTS)).toBe(818);
  });

  it("traverse sans perte depuis le centime", () => {
    expect(millicentsFromCents(210)).toBe(210_000);
    expect(centsFromMillicents(millicentsFromCents(210))).toBe(210);
  });
});

describe("lineTotalCents", () => {
  /**
   * **Le test qui justifie tout le chantier.** Douze articles à 9,00 € TTC
   * facturaient 107,98 € au lieu de 108,00 : l'arrondi du prix unitaire,
   * multiplié par douze. Un seul arrondi, au total, et l'écart disparaît.
   */
  it("n'arrondit qu'une fois, à la fin", () => {
    expect(lineTotalCents(PRO_HT_MILLICENTS, 12)).toBe(9_818);
    // 9 818 HT + 982 de TVA à 10 % = 10 800, soit douze fois 9,00 €.
    expect(9_818 + Math.round((9_818 * 10) / 100)).toBe(12 * 900);
  });

  it("échoue là où arrondir le prix unitaire d'abord échouait", () => {
    const naive = centsFromMillicents(PRO_HT_MILLICENTS) * 12;
    expect(naive).toBe(9_816);
    expect(lineTotalCents(PRO_HT_MILLICENTS, 12)).not.toBe(naive);
  });

  it("reste exact sur un prix posé en centimes ronds", () => {
    expect(lineTotalCents(millicentsFromCents(210), 7)).toBe(1_470);
  });

  it("rend zéro pour une quantité nulle", () => {
    expect(lineTotalCents(PRO_HT_MILLICENTS, 0)).toBe(0);
  });
});

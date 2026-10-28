import { roundToCents } from "../exact.js";
import { lineTotalCents } from "../millicents.js";
import { grams, pieces } from "../sale-quantity.js";

/** 12,40 € le kilo, hors taxe, en millicentimes. */
const PER_KILOGRAM_MILLICENTS = 1_240_000;

/** La formule d'avant le plan du poids, recopiée : la référence des pièces. */
function formerLineTotalCents(unitMillicents: number, quantity: number): number {
  return roundToCents({
    num: BigInt(Math.trunc(unitMillicents)) * BigInt(Math.trunc(quantity)),
    den: 1_000n,
  });
}

describe("SaleQuantity — les constructeurs nommés", () => {
  it("porte l'unité de la ligne", () => {
    expect(pieces(3)).toEqual({ amount: 3, unit: "piece" });
    expect(grams(1250)).toEqual({ amount: 1250, unit: "weight" });
  });

  it("accepte zéro", () => {
    expect(pieces(0).amount).toBe(0);
    expect(grams(0).amount).toBe(0);
  });

  it.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "refuse %p pièces plutôt que de tronquer",
    (value) => {
      expect(() => pieces(value)).toThrow(RangeError);
    },
  );

  it.each([0.5, -250, Number.NaN])("refuse %p grammes", (value) => {
    expect(() => grams(value)).toThrow(/grammes/);
  });
});

describe("lineTotalCents — à la pièce, inchangé", () => {
  it("rend, à l'octet, ce que rendait l'ancienne signature sur un balayage", () => {
    const prices = [0, 1, 499, 500, 501, 818_182, 157_500, 33_333, 2_147_483_647];
    const counts = [0, 1, 2, 3, 7, 12, 75, 250, 10_000];
    for (const price of prices) {
      for (const count of counts) {
        expect(lineTotalCents(price, pieces(count))).toBe(formerLineTotalCents(price, count));
      }
    }
  });
});

describe("lineTotalCents — au poids, prix au kilo", () => {
  it("1 250 g à 12,40 € / kg font 15,50 €", () => {
    expect(lineTotalCents(PER_KILOGRAM_MILLICENTS, grams(1250))).toBe(1_550);
  });

  it("n'est pas le calcul à la pièce : des grammes pris pour des pièces coûteraient mille fois plus", () => {
    expect(lineTotalCents(PER_KILOGRAM_MILLICENTS, pieces(1250))).toBe(1_550_000);
  });

  it("n'arrondit qu'une fois, au centime le plus proche", () => {
    // 12,345 67 € / kg × 333 g = 4,111 108 11 € → 4,11 €.
    expect(lineTotalCents(1_234_567, grams(333))).toBe(411);
  });

  it("arrondit la moitié vers le haut, et pas en deçà", () => {
    // 1 centime le kilo : 500 g valent un demi-centime, 499 g un peu moins.
    expect(lineTotalCents(1_000, grams(500))).toBe(1);
    expect(lineTotalCents(1_000, grams(499))).toBe(0);
  });

  it("rend zéro pour zéro gramme", () => {
    expect(lineTotalCents(PER_KILOGRAM_MILLICENTS, grams(0))).toBe(0);
  });

  it("reste exact au-delà de la précision d'un flottant", () => {
    // Le produit dépasse 2⁵³ : seul le calcul en BigInt le tient.
    expect(lineTotalCents(2_000_000_003, grams(999_999_999))).toBe(2_000_000_001_000);
  });
});

import { InvalidProPriceError } from "../../errors/product-errors.js";
import { MAX_PRO_PRICE_MILLICENTS, ProPriceHt } from "../pro-price-ht.js";

describe("ProPriceHt — le prix pro HT saisi, au plus cinq décimales", () => {
  it.each([
    ["12.34567", 1_234_567],
    ["12,5", 1_250_000],
    ["3", 300_000],
    ["0", 0],
    ["0.00001", 1],
    [" 7.1 ", 710_000],
  ])("lit « %s » en %i millicentimes", (raw, millicents) => {
    expect(ProPriceHt.fromEuros(raw).millicents).toBe(millicents);
  });

  /** Le cinquième chiffre ne passe jamais par un flottant : 1.00001 × 10⁵ ne tombe pas juste. */
  it("ne dérive pas au cinquième chiffre", () => {
    expect(ProPriceHt.fromEuros("1.00001").millicents).toBe(100_001);
    expect(ProPriceHt.fromEuros("0.29999").millicents).toBe(29_999);
  });

  it("refuse une sixième décimale au lieu de l'arrondir", () => {
    expect(() => ProPriceHt.fromEuros("1.123456")).toThrow(InvalidProPriceError);
    expect(() => ProPriceHt.fromEuros("1.123456")).toThrow(/au plus 5 décimales/);
  });

  it.each(["-1", "abc", "", "1.", ".5", "1e3", "1.2.3"])("refuse « %s »", (raw) => {
    expect(() => ProPriceHt.fromEuros(raw)).toThrow(InvalidProPriceError);
  });

  it("refuse au-delà de la colonne plutôt que de laisser la base lever", () => {
    expect(ProPriceHt.fromMillicents(MAX_PRO_PRICE_MILLICENTS).millicents).toBe(
      MAX_PRO_PRICE_MILLICENTS,
    );
    expect(() => ProPriceHt.fromEuros("21474.83648")).toThrow(InvalidProPriceError);
    expect(() => ProPriceHt.fromMillicents(-1)).toThrow(InvalidProPriceError);
    expect(() => ProPriceHt.fromMillicents(1.5)).toThrow(InvalidProPriceError);
  });
});

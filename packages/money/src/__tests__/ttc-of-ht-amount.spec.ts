import { ttcOfHtAmount } from "../ttc-of-ht-amount.js";

describe("ttcOfHtAmount — un montant fixe saisi HT, en TTC", () => {
  it("convertit à un seul taux", () => {
    expect(ttcOfHtAmount(500, new Map([[20, 1n]]))).toBe(600);
  });

  it("convertit au prorata des poids, un seul arrondi", () => {
    // 100 × (1 × 1,055 + 1 × 1,20) / 2 = 112,75 → 113.
    expect(
      ttcOfHtAmount(
        100,
        new Map([
          [5.5, 1n],
          [20, 1n],
        ]),
      ),
    ).toBe(113);
  });

  it("ignore un poids nul", () => {
    expect(
      ttcOfHtAmount(
        1000,
        new Map([
          [5.5, 10n],
          [20, 0n],
        ]),
      ),
    ).toBe(1055);
  });

  it("refuse de convertir sans taux pondéré", () => {
    expect(() => ttcOfHtAmount(100, new Map())).toThrow(RangeError);
  });
});

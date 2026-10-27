import { allocateRateVat, rateVatCents } from "../ttc-vat-allocation.js";

describe("allocateRateVat — la règle de répartition du § 4", () => {
  it("arrondit la moitié en s'éloignant de zéro : +0,5 → 1, −0,5 → −1", () => {
    // 3 c à 20 % contiennent 0,5 c de TVA.
    expect(allocateRateVat([3, -3], 20).map((term) => term.vatCents)).toEqual([1, -1]);
  });

  it("un écart négatif va au plus petit reste, la première ligne départageant l'égalité", () => {
    // 2 × 0,5 → 1 + 1 = 2, TVA du taux ⌈1⌉ = 1 : écart −1.
    expect(allocateRateVat([3, 3], 20).map((term) => term.vatCents)).toEqual([0, 1]);
  });

  it("un terme à TTC nul ne reçoit rien", () => {
    expect(allocateRateVat([0, 1], 20)).toEqual([
      { ttcCents: 0, vatCents: 0, htCents: 0 },
      { ttcCents: 1, vatCents: 1, htCents: 0 },
    ]);
  });

  it("extrait la TVA d'un taux au centime supérieur", () => {
    expect(rateVatCents(1345, 20)).toBe(225);
    expect(rateVatCents(0, 5.5)).toBe(0);
  });
});

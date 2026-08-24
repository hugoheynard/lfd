import { computeVatCents } from "../vat.js";

describe("computeVatCents", () => {
  it("applique 5,5 % sur des marchandises alimentaires", () => {
    // 1000 HT × 5,5 % = 55.
    const vat = computeVatCents({
      // 5,5 % : le taux d'un article alimentaire, tel que le PIM le résout.
      lines: [{ htCents: 1000, vatRate: 5.5 }],
      discountCents: 0,
      deliveryFeeCents: 0,
    });
    expect(vat).toBe(55);
  });

  it("déduit la remise au prorata avant d'appliquer le taux", () => {
    // (400 − 80) × 5,5 % = 320 × 0,055 = 17,6 → 18.
    const vat = computeVatCents({
      lines: [{ htCents: 400, vatRate: 5.5 }],
      discountCents: 80,
      deliveryFeeCents: 0,
    });
    expect(vat).toBe(18);
  });

  it("ajoute la TVA de livraison à 20 %", () => {
    // marchandises 1000 × 5,5 % = 55 ; livraison 2000 × 20 % = 400 ; total 455.
    const vat = computeVatCents({
      lines: [{ htCents: 1000, vatRate: 5.5 }],
      discountCents: 0,
      deliveryFeeCents: 2000,
    });
    expect(vat).toBe(455);
  });

  it("regroupe par taux et arrondit par groupe", () => {
    // 500 × 5,5 % = 27,5 → 28 ; 300 × 20 % = 60 ; total 88.
    const vat = computeVatCents({
      lines: [
        { htCents: 500, vatRate: 5.5 },
        { htCents: 300, vatRate: 20 },
      ],
      discountCents: 0,
      deliveryFeeCents: 0,
    });
    expect(vat).toBe(88);
  });

  it("ne calcule que la TVA de livraison quand il n'y a pas de marchandise", () => {
    const vat = computeVatCents({ lines: [], discountCents: 0, deliveryFeeCents: 1000 });
    expect(vat).toBe(200);
  });
});

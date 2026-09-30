import { InvalidPurchasePriceError } from "../../errors/delivery-purchase-errors.js";
import { PURCHASE_PRICE_MAX_CENTS, PurchasePrice } from "../purchase-price.js";

describe("PurchasePrice", () => {
  it("accepte zéro — un bac offert est un prix, pas une absence", () => {
    expect(PurchasePrice.ofCents(0).centsExclVat).toBe(0);
  });

  it("accepte la borne haute, pile", () => {
    expect(PurchasePrice.ofCents(PURCHASE_PRICE_MAX_CENTS).centsExclVat).toBe(
      PURCHASE_PRICE_MAX_CENTS,
    );
  });

  it.each([
    ["négatif", -1],
    ["non entier (des euros saisis avec virgule)", 12.5],
    ["au-delà de la borne", PURCHASE_PRICE_MAX_CENTS + 1],
    ["NaN", Number.NaN],
    ["infini", Number.POSITIVE_INFINITY],
  ])("refuse un prix %s", (_label, cents) => {
    expect(() => PurchasePrice.ofCents(cents)).toThrow(InvalidPurchasePriceError);
  });

  it("nomme le geste de sortie dans le refus", () => {
    expect(() => PurchasePrice.ofCents(-5)).toThrow(/laissez le prix vide s'il est inconnu/u);
  });
});

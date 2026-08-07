import { InvalidSubscriptionLineError } from "../../errors/subscription-errors.js";
import { SubscriptionLine } from "../subscription-line.js";

describe("SubscriptionLine", () => {
  it("crée une ligne valide et trime le SKU", () => {
    const line = SubscriptionLine.create("  SKU-1  ", 3);
    expect(line.sku).toBe("SKU-1");
    expect(line.quantity).toBe(3);
  });

  it("refuse un SKU vide (ou uniquement des espaces)", () => {
    expect(() => SubscriptionLine.create("   ", 1)).toThrow(InvalidSubscriptionLineError);
  });

  it("refuse une quantité nulle ou négative", () => {
    expect(() => SubscriptionLine.create("SKU-1", 0)).toThrow(InvalidSubscriptionLineError);
    expect(() => SubscriptionLine.create("SKU-1", -2)).toThrow(InvalidSubscriptionLineError);
  });

  it("refuse une quantité non entière", () => {
    expect(() => SubscriptionLine.create("SKU-1", 1.5)).toThrow(InvalidSubscriptionLineError);
  });
});

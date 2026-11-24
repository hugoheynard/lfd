import {
  InvalidBasketLineError,
  WeightArticleInSubscriptionError,
} from "../../errors/basket-errors.js";
import { BasketLine } from "../basket-line.js";

describe("BasketLine", () => {
  it("crée une ligne valide et trime le SKU", () => {
    const line = BasketLine.create("  SKU-1  ", 3);
    expect(line.sku).toBe("SKU-1");
    expect(line.quantity).toBe(3);
  });

  it("refuse un SKU vide (ou uniquement des espaces)", () => {
    expect(() => BasketLine.create("   ", 1)).toThrow(InvalidBasketLineError);
  });

  it("refuse une quantité nulle ou négative", () => {
    expect(() => BasketLine.create("SKU-1", 0)).toThrow(InvalidBasketLineError);
    expect(() => BasketLine.create("SKU-1", -2)).toThrow(InvalidBasketLineError);
  });

  it("refuse une quantité non entière", () => {
    expect(() => BasketLine.create("SKU-1", 1.5)).toThrow(InvalidBasketLineError);
  });
});

/** La vente au poids (`vente-au-poids.md`, §2) : hors des paniers récurrents. */
describe("BasketLine.requested", () => {
  it("accepte un article à la pièce", () => {
    expect(BasketLine.requested("SKU-1", 3, "piece")).toMatchObject({
      sku: "SKU-1",
      quantity: 3,
    });
  });

  it("refuse un article au poids, en le nommant", () => {
    expect(() => BasketLine.requested(" SAU-001 ", 500, "weight")).toThrow(
      new WeightArticleInSubscriptionError("SAU-001"),
    );
  });
});

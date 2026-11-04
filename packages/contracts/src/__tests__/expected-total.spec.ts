import { expectedTotalCentsSchema } from "../order.js";

/** Plan `le-prix-d-un-panier.md`, T2 : le total vu, en centimes entiers, facultatif aux contrats. */
describe("expectedTotalCentsSchema", () => {
  it("accepte des centimes entiers, zéro compris", () => {
    expect(expectedTotalCentsSchema.parse(4230)).toBe(4230);
    expect(expectedTotalCentsSchema.parse(0)).toBe(0);
  });

  it("refuse un montant à virgule ou négatif", () => {
    expect(() => expectedTotalCentsSchema.parse(42.3)).toThrow();
    expect(() => expectedTotalCentsSchema.parse(-1)).toThrow();
  });
});

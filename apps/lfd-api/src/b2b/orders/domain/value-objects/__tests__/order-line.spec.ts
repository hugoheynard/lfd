import { InvalidOrderLineError } from "../../errors/order-errors.js";
import { OrderLine } from "../order-line.js";

const base = {
  sku: "VIE-001",
  productName: "Croissant",
  unitPriceMillicents: 200_000,
  vatRate: 5.5,
};

describe("OrderLine", () => {
  it("calcule le total de ligne = prix unitaire × quantité", () => {
    const line = OrderLine.create({ ...base, quantity: 3 });
    expect(line.lineTotalCents).toBe(600);
    expect(line.toSnapshot()).toEqual({
      ...base,
      quantity: 3,
      lineTotalCents: 600,
      pricing: null,
      allergens: null,
    });
  });

  it("refuse une quantité nulle, négative ou non entière", () => {
    expect(() => OrderLine.create({ ...base, quantity: 0 })).toThrow(InvalidOrderLineError);
    expect(() => OrderLine.create({ ...base, quantity: -1 })).toThrow(InvalidOrderLineError);
    expect(() => OrderLine.create({ ...base, quantity: 1.5 })).toThrow(InvalidOrderLineError);
  });

  it("refuse un prix unitaire négatif", () => {
    expect(() => OrderLine.create({ ...base, unitPriceMillicents: -1, quantity: 1 })).toThrow(
      InvalidOrderLineError,
    );
  });

  /**
   * 🔴 Les allergènes se figent comme le prix, et c'était la seule chose que la
   * ligne ne figeait pas. Sans ce gel, une correction de déclaration effaçait
   * ce sous quoi la commande avait été passée — et sur réclamation, la réponse
   * était un blanc.
   */
  it("fige les allergènes qu'on lui donne, codes ET libellés", () => {
    const line = OrderLine.create({
      ...base,
      quantity: 1,
      allergens: {
        codes: ["AU"],
        labels: [{ category: "gluten", label: "gluten" }],
        incomplete: false,
      },
    });

    expect(line.toSnapshot().allergens).toEqual({
      codes: ["AU"],
      labels: [{ category: "gluten", label: "gluten" }],
      incomplete: false,
    });
  });

  /**
   * 🔴 L'absence reste une ABSENCE. Retomber sur `{ codes: [] }` affirmerait
   * « aucun allergène » sur une ligne dont personne n'a rien déclaré — et cette
   * affirmation-là partirait figée dans une commande, donc irrattrapable.
   */
  it("n'invente aucune déclaration quand on ne lui en donne pas", () => {
    expect(OrderLine.create({ ...base, quantity: 1 }).toSnapshot().allergens).toBeNull();
  });

  /** Les trois états du référentiel traversent : `[]` AFFIRME, `null` se tait. */
  it("distingue « déclaré sans allergène » de « pas de fiche »", () => {
    const declared = OrderLine.create({
      ...base,
      quantity: 1,
      allergens: { codes: [], labels: [], incomplete: false },
    });

    expect(declared.toSnapshot().allergens?.codes).toEqual([]);
    expect(OrderLine.create({ ...base, quantity: 1 }).toSnapshot().allergens).toBeNull();
  });
});

import { DEFAULT_ORDER_OPENING, orderOpeningPatchSchema, ordersOpenTo } from "../order-opening.js";

describe("l'ouverture de la boutique à la commande", () => {
  /** Rien ne se ferme au déploiement : la fermeture est un geste du staff. */
  it("est ouverte aux deux clientèles tant que personne ne l'a réglée", () => {
    expect(ordersOpenTo(DEFAULT_ORDER_OPENING, "b2b")).toBe(true);
    expect(ordersOpenTo(DEFAULT_ORDER_OPENING, "b2c")).toBe(true);
  });

  it("lit la case de la clientèle, et seulement elle", () => {
    const closedToB2c = { ordersOpenToB2b: true, ordersOpenToB2c: false };
    expect(ordersOpenTo(closedToB2c, "b2b")).toBe(true);
    expect(ordersOpenTo(closedToB2c, "b2c")).toBe(false);
    const closedToB2b = { ordersOpenToB2b: false, ordersOpenToB2c: true };
    expect(ordersOpenTo(closedToB2b, "b2b")).toBe(false);
    expect(ordersOpenTo(closedToB2b, "b2c")).toBe(true);
  });

  it("refuse un patch qui ne règle aucune clientèle", () => {
    expect(orderOpeningPatchSchema.safeParse({}).success).toBe(false);
    expect(orderOpeningPatchSchema.safeParse({ ordersOpenToB2c: false }).success).toBe(true);
  });
});

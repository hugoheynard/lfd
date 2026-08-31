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
    expect(line.toSnapshot()).toEqual({ ...base, quantity: 3, lineTotalCents: 600, pricing: null });
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
});

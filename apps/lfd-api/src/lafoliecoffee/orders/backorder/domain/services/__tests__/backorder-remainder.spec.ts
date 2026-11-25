import { InvalidBackorderLineError } from "../../errors/backorder-errors.js";
import { backorderRemainderOf } from "../backorder-remainder.js";

describe("backorderRemainderOf — le reste par article", () => {
  it("reste partiel : commandé moins parti, dans l'unité de la ligne", () => {
    const remainder = backorderRemainderOf(
      [
        { sku: "CRO", quantity: 12, saleUnit: "piece" },
        { sku: "PAI", quantity: 4, saleUnit: "piece" },
      ],
      [
        { sku: "CRO", quantity: 9 },
        { sku: "PAI", quantity: 4 },
      ],
    );

    expect(remainder.map((line) => ({ ...line }))).toEqual([
      { sku: "CRO", quantity: 3, saleUnit: "piece" },
    ]);
  });

  it("au poids, le reste est en grammes", () => {
    const remainder = backorderRemainderOf(
      [{ sku: "COM", quantity: 1500, saleUnit: "weight" }],
      [{ sku: "COM", quantity: 1250 }],
    );

    expect(remainder.map((line) => ({ ...line }))).toEqual([
      { sku: "COM", quantity: 250, saleUnit: "weight" },
    ]);
  });

  it("tout parti : aucun reste", () => {
    const remainder = backorderRemainderOf(
      [{ sku: "CRO", quantity: 12, saleUnit: "piece" }],
      [{ sku: "CRO", quantity: 12 }],
    );

    expect(remainder).toEqual([]);
  });

  it("un article parti à zéro reste en entier", () => {
    const remainder = backorderRemainderOf(
      [
        { sku: "CRO", quantity: 12, saleUnit: "piece" },
        { sku: "PAI", quantity: 4, saleUnit: "piece" },
      ],
      [
        { sku: "CRO", quantity: 12 },
        { sku: "PAI", quantity: 0 },
      ],
    );

    expect(remainder.map((line) => ({ ...line }))).toEqual([
      { sku: "PAI", quantity: 4, saleUnit: "piece" },
    ]);
  });

  it("aucun article parti : toute la commande reste, dans l'ordre de la commande", () => {
    const remainder = backorderRemainderOf(
      [
        { sku: "PAI", quantity: 4, saleUnit: "piece" },
        { sku: "COM", quantity: 1500, saleUnit: "weight" },
        { sku: "CRO", quantity: 12, saleUnit: "piece" },
      ],
      [],
    );

    expect(remainder.map((line) => ({ ...line }))).toEqual([
      { sku: "PAI", quantity: 4, saleUnit: "piece" },
      { sku: "COM", quantity: 1500, saleUnit: "weight" },
      { sku: "CRO", quantity: 12, saleUnit: "piece" },
    ]);
  });

  it("une commande sans ligne ne laisse aucun reste", () => {
    expect(backorderRemainderOf([], [{ sku: "CRO", quantity: 3 }])).toEqual([]);
  });

  it("ignore un article parti qui n'est pas dans la commande", () => {
    const remainder = backorderRemainderOf(
      [{ sku: "CRO", quantity: 5, saleUnit: "piece" }],
      [{ sku: "GHOST", quantity: 7 }],
    );

    expect(remainder.map((line) => ({ ...line }))).toEqual([
      { sku: "CRO", quantity: 5, saleUnit: "piece" },
    ]);
  });

  // Un départ supérieur au commandé ne doit jamais produire une quantité négative.
  it("parti au-delà du commandé : aucun reste, et pas de quantité négative", () => {
    const remainder = backorderRemainderOf(
      [{ sku: "CRO", quantity: 5, saleUnit: "piece" }],
      [{ sku: "CRO", quantity: 8 }],
    );

    expect(remainder).toEqual([]);
  });

  it("une ligne commandée à zéro ne laisse aucun reste", () => {
    const remainder = backorderRemainderOf([{ sku: "CRO", quantity: 0, saleUnit: "piece" }], []);

    expect(remainder).toEqual([]);
  });

  it("deux lignes du même article s'additionnent, l'unité de la première fait foi", () => {
    const remainder = backorderRemainderOf(
      [
        { sku: "CRO", quantity: 5, saleUnit: "piece" },
        { sku: "CRO", quantity: 7, saleUnit: "piece" },
      ],
      [{ sku: "CRO", quantity: 2 }],
    );

    expect(remainder.map((line) => ({ ...line }))).toEqual([
      { sku: "CRO", quantity: 10, saleUnit: "piece" },
    ]);
  });

  it("plusieurs départs du même article s'additionnent", () => {
    const remainder = backorderRemainderOf(
      [{ sku: "CRO", quantity: 10, saleUnit: "piece" }],
      [
        { sku: "CRO", quantity: 3 },
        { sku: "CRO", quantity: 4 },
      ],
    );

    expect(remainder.map((line) => ({ ...line }))).toEqual([
      { sku: "CRO", quantity: 3, saleUnit: "piece" },
    ]);
  });

  it("un seul article commandé, un seul reste", () => {
    const remainder = backorderRemainderOf([{ sku: "CRO", quantity: 1, saleUnit: "piece" }], []);

    expect(remainder.map((line) => ({ ...line }))).toEqual([
      { sku: "CRO", quantity: 1, saleUnit: "piece" },
    ]);
  });

  it("refuse un reste dont l'unité est inconnue", () => {
    expect(() =>
      backorderRemainderOf([{ sku: "CRO", quantity: 2, saleUnit: "dozen" }], []),
    ).toThrow(InvalidBackorderLineError);
  });
});

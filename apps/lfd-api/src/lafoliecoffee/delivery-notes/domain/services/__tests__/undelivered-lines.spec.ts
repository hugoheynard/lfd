import { undeliveredOf } from "../undelivered-lines.js";
import { BREAD, CROISSANT, handedOverNote } from "./delivery-note-sheet.fixture.js";

describe("undeliveredOf — ce qui manque après un BL (Hugo, 2026-11-03)", () => {
  it("rend commandé − livré par article, dans l'ordre de la commande", () => {
    const note = handedOverNote();
    const lines = note.lines.map((line) => ({ ...line, quantity: line.sku === BREAD.sku ? 9 : 0 }));
    const state = { ...note, lines };

    expect(undeliveredOf([BREAD, CROISSANT], [state], state)).toEqual([
      { productName: "Pain de campagne", quantity: 3, saleUnit: "piece" },
      { productName: "Croissant", quantity: 6, saleUnit: "piece" },
    ]);
  });

  it("est vide quand tout part", () => {
    const state = handedOverNote();

    expect(undeliveredOf([BREAD, CROISSANT], [state], state)).toEqual([]);
  });

  it("compte les BL de rang inférieur, pas les annulés ni les suivants", () => {
    const first = { ...handedOverNote(), lines: [{ ...BREAD, quantity: 8 }] };
    const voided = { ...first, id: "dn_v", rank: 2, status: "voided" as const };
    const remainder = { ...first, id: "dn_2", rank: 3, lines: [{ ...BREAD, quantity: 2 }] };
    const later = { ...first, id: "dn_3", rank: 4, lines: [{ ...BREAD, quantity: 2 }] };
    const notes = [first, voided, remainder, later];

    expect(undeliveredOf([BREAD], notes, first)).toEqual([
      { productName: "Pain de campagne", quantity: 4, saleUnit: "piece" },
    ]);
    expect(undeliveredOf([BREAD], notes, remainder)).toEqual([
      { productName: "Pain de campagne", quantity: 2, saleUnit: "piece" },
    ]);
  });

  it("garde l'unité au poids, en grammes", () => {
    const loaf = { ...BREAD, saleUnit: "weight" as const, quantity: 1500 };
    const state = { ...handedOverNote(), lines: [{ ...loaf, quantity: 1000 }] };

    expect(undeliveredOf([loaf], [state], state)).toEqual([
      { productName: "Pain de campagne", quantity: 500, saleUnit: "weight" },
    ]);
  });
});

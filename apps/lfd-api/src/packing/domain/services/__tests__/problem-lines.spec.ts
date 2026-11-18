import { PresentBeyondDueError } from "../../errors/packing-problem-errors.js";
import { PackingLineNotFoundError } from "../../errors/packing-station-errors.js";
import type { SheetLine } from "../../entities/packing-sheet.snapshot.js";
import { presentLinesOf } from "../problem-lines.js";

const LINES: readonly SheetLine[] = [
  { sku: "PAC", productName: "Pain au chocolat", quantity: 6, packed: null, saleUnit: "piece" },
  { sku: "CRO", productName: "Croissant", quantity: 4, packed: null, saleUnit: "piece" },
];

describe("presentLinesOf — ce que « Problème » dit, ligne par ligne", () => {
  it("rend chaque ligne dans l'ordre des SKU ; une ligne non citée est entièrement là", () => {
    expect(presentLinesOf("ORD-0001", LINES, [{ sku: "PAC", present: 2 }])).toEqual([
      { line: LINES[1], present: 4 },
      { line: LINES[0], present: 2 },
    ]);
  });

  it("refuse un SKU qui n'est pas sur le bon", () => {
    expect(() => presentLinesOf("ORD-0001", LINES, [{ sku: "BAG", present: 1 }])).toThrow(
      PackingLineNotFoundError,
    );
  });

  it("refuse plus de présents que de commandés", () => {
    expect(() => presentLinesOf("ORD-0001", LINES, [{ sku: "CRO", present: 5 }])).toThrow(
      PresentBeyondDueError,
    );
  });
});

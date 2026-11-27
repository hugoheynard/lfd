import {
  DuplicatePlannedLineError,
  InvalidPlannedLineError,
} from "../../errors/planned-column-errors.js";
import { PlannedLine } from "../planned-line.js";

describe("PlannedLine", () => {
  it("garde un SKU nettoyé et une quantité entière positive", () => {
    const line = PlannedLine.create("  CRO-01 ", 40);
    expect(line).toMatchObject({ sku: "CRO-01", quantity: 40 });
  });

  it.each([
    ["", 1],
    ["CRO-01", 0],
    ["CRO-01", -2],
    ["CRO-01", 1.5],
  ])("refuse la ligne (%s, %s)", (sku, quantity) => {
    expect(() => PlannedLine.create(sku, quantity)).toThrow(InvalidPlannedLineError);
  });

  it("refuse une colonne qui porte deux fois le même article", () => {
    const lines = [PlannedLine.create("CRO-01", 1), PlannedLine.create("CRO-01", 2)];
    expect(() => PlannedLine.column(lines)).toThrow(DuplicatePlannedLineError);
  });
});

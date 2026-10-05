import type { SheetLine } from "../../entities/packing-sheet.snapshot.js";
import { allocatedOnLine, leftToPlace, shortfall } from "../placement.js";

const AT = new Date(0);

function line(quantity: number, packed: boolean): SheetLine {
  return {
    sku: "CRO",
    productName: "Croissant",
    quantity,
    packed: packed ? { at: AT, by: "s1", initials: "" } : null,
  };
}

describe("placement — la règle unique du reste à poser", () => {
  it("listed : additionne ce que portent les contenants, cochée ou non", () => {
    const containers = [
      { lines: [{ sku: "CRO", quantity: 18 }] },
      { lines: [{ sku: "PAI", quantity: 4 }] },
      { lines: [{ sku: "CRO", quantity: 2 }] },
    ];
    expect(allocatedOnLine("listed", line(38, false), containers)).toBe(20);
    expect(allocatedOnLine("listed", line(38, true), [])).toBe(0);
  });

  it("counted : tout ou rien, selon la coche", () => {
    const containers = [{ lines: [{ sku: "CRO", quantity: 18 }] }];
    expect(allocatedOnLine("counted", line(38, true), containers)).toBe(38);
    expect(allocatedOnLine("counted", line(38, false), containers)).toBe(0);
  });

  it("le reste à poser ne descend jamais sous zéro", () => {
    expect(leftToPlace(38, 18)).toBe(20);
    expect(leftToPlace(38, 38)).toBe(0);
    expect(leftToPlace(38, 40)).toBe(0);
  });

  it("le manque : zéro quand le libre suffit, l'écart sinon, dette comprise", () => {
    expect(shortfall(77, 77)).toBe(0);
    expect(shortfall(77, 78)).toBe(1);
    expect(shortfall(-5, 2)).toBe(7);
    expect(shortfall(-5, 0)).toBe(0);
  });
});

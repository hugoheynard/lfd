import {
  columnWidthStepOf,
  isColumnWidthStep,
  twelfthsOf,
  widthsFillTheRow,
} from "../column-widths.js";

describe("crans de largeur", () => {
  it.each([[[50, 50]], [[33, 67]], [[25, 75]], [[33, 33, 33]], [[25, 50, 25]]] as const)(
    "%j fait une ligne pleine",
    (widths) => {
      expect(widthsFillTheRow(widths)).toBe(true);
    },
  );

  it.each([[[50, 25]], [[75, 75]], [[33, 33]], [[25, 25, 25]]] as const)(
    "%j ne fait pas une ligne pleine",
    (widths) => {
      expect(widthsFillTheRow(widths)).toBe(false);
    },
  );

  it("n'admet que les cinq crans", () => {
    expect([25, 33, 50, 67, 75].every(isColumnWidthStep)).toBe(true);
    expect(isColumnWidthStep(34)).toBe(false);
    expect(isColumnWidthStep(100)).toBe(false);
  });

  it("admet chaque douzième de 2 à 10, et pas au-delà (2026-11-08)", () => {
    expect([17, 42, 58, 83].every(isColumnWidthStep)).toBe(true);
    expect(isColumnWidthStep(8)).toBe(false);
    expect(isColumnWidthStep(92)).toBe(false);
    expect(widthsFillTheRow([17, 17, 67])).toBe(true);
    expect(widthsFillTheRow([42, 58])).toBe(true);
    expect(widthsFillTheRow([42, 50])).toBe(false);
  });

  it("passe des douzièmes au cran et retour", () => {
    expect(columnWidthStepOf(5)).toBe(42);
    expect(columnWidthStepOf(1)).toBeNull();
    expect(columnWidthStepOf(11)).toBeNull();
    expect(twelfthsOf(83)).toBe(10);
  });
});

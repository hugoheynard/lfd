import { isColumnWidthStep, widthsFillTheRow } from "../column-widths.js";

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
});

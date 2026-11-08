import { MAIL_BODY_WIDTH_PX, type ColumnWidthStep } from "@lfd/mail-blocks";

import { COLUMN_GUTTER_PX, columnRowGeometry } from "../column-geometry.js";

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);
const pxOf = (percent: number): number => (percent / 100) * MAIL_BODY_WIDTH_PX;

describe("columnRowGeometry", () => {
  const rows: readonly (readonly ColumnWidthStep[])[] = [
    [50, 50],
    [33, 33, 33],
    [58, 42],
    [17, 17, 67],
    [25, 25, 50],
  ];

  it.each(rows)("ferme la ligne à 100 %% tout juste (%j)", (...widths) => {
    const geometry = columnRowGeometry(widths);
    expect(sum([...geometry.columns, ...geometry.gutters])).toBeCloseTo(100, 9);
  });

  it("deux colonnes de même cran ont exactement la même largeur, à 2 comme à 3", () => {
    expect(new Set(columnRowGeometry([50, 50]).columns).size).toBe(1);
    expect(new Set(columnRowGeometry([33, 33, 33]).columns).size).toBe(1);
    const [first, second] = columnRowGeometry([25, 25, 50]).columns;
    expect(first).toBe(second);
  });

  it("une gouttière de moins que de colonnes, d'au moins 12 px chacune", () => {
    const geometry = columnRowGeometry([33, 33, 33]);
    expect(geometry.gutters).toHaveLength(2);
    for (const gutter of geometry.gutters) {
      expect(pxOf(gutter)).toBeGreaterThanOrEqual(COLUMN_GUTTER_PX - 0.05);
    }
  });

  it("garde les proportions des crans sur la place utile", () => {
    const [left, right] = columnRowGeometry([58, 42]).columns;
    expect((left ?? 0) / (right ?? 1)).toBeCloseTo(7 / 5, 1);
  });
});

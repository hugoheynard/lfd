import { isUnitFraction, isUnitPoint, sameUnitPoint } from "../unit-point.js";

describe("isUnitFraction", () => {
  it.each([0, 0.5, 1])("admet %p", (value) => {
    expect(isUnitFraction(value)).toBe(true);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])("refuse %p", (value) => {
    expect(isUnitFraction(value)).toBe(false);
  });
});

describe("isUnitPoint", () => {
  it("admet les coins du carré", () => {
    expect(isUnitPoint({ x: 0, y: 1 })).toBe(true);
  });

  it("refuse un point dont une seule coordonnée sort", () => {
    expect(isUnitPoint({ x: 0.5, y: 1.2 })).toBe(false);
    expect(isUnitPoint({ x: Number.NaN, y: 0.5 })).toBe(false);
  });
});

describe("sameUnitPoint", () => {
  it("deux absences sont égales", () => {
    expect(sameUnitPoint(null, null)).toBe(true);
  });

  it("une absence n'est pas le centre", () => {
    expect(sameUnitPoint(null, { x: 0.5, y: 0.5 })).toBe(false);
    expect(sameUnitPoint({ x: 0.5, y: 0.5 }, null)).toBe(false);
  });

  it("compare par valeur", () => {
    expect(sameUnitPoint({ x: 0.2, y: 0.3 }, { x: 0.2, y: 0.3 })).toBe(true);
    expect(sameUnitPoint({ x: 0.2, y: 0.3 }, { x: 0.3, y: 0.2 })).toBe(false);
  });
});

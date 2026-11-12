import { sameStructure } from "../same-structure.js";

describe("sameStructure", () => {
  it("ignore l'ordre des clés et les clés à undefined", () => {
    expect(sameStructure({ a: 1, b: { c: "x" } }, { b: { c: "x" }, a: 1, d: undefined })).toBe(
      true,
    );
  });

  it("compare les tableaux dans l'ordre", () => {
    expect(sameStructure([1, 2], [1, 2])).toBe(true);
    expect(sameStructure([1, 2], [2, 1])).toBe(false);
  });

  it("compare les dates par leur instant", () => {
    expect(sameStructure(new Date(5), new Date(5))).toBe(true);
    expect(sameStructure(new Date(5), new Date(6))).toBe(false);
  });

  it("distingue null, une valeur et un objet", () => {
    expect(sameStructure(null, { a: 1 })).toBe(false);
    expect(sameStructure({ a: null }, { a: 0 })).toBe(false);
    expect(sameStructure({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("compare les instances de classe par leurs champs", () => {
    class Point {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
    }
    expect(sameStructure(new Point(1, 2), new Point(1, 2))).toBe(true);
    expect(sameStructure(new Point(1, 2), new Point(1, 3))).toBe(false);
  });
});

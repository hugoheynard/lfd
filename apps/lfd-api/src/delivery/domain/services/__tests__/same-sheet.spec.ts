import { sameSheet } from "../same-sheet.js";

describe("sameSheet", () => {
  it("tient deux fiches égales pour la même, quel que soit l'ordre des clés", () => {
    expect(sameSheet({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
  });

  it("voit une valeur changée au fond d'un objet", () => {
    expect(sameSheet({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it("tient compte de l'ordre d'un tableau et de sa longueur", () => {
    expect(sameSheet([1, 2], [2, 1])).toBe(false);
    expect(sameSheet([1], [1, 1])).toBe(false);
  });

  it("confond une clé absente et une clé à undefined, jamais null et undefined", () => {
    expect(sameSheet({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(sameSheet({ a: null }, {})).toBe(false);
  });

  it("compare deux dates par leur instant", () => {
    expect(sameSheet(new Date(5), new Date(5))).toBe(true);
    expect(sameSheet(new Date(5), new Date(6))).toBe(false);
    expect(sameSheet(new Date(5), 5)).toBe(false);
  });

  it("ne confond pas un tableau et un objet", () => {
    expect(sameSheet([], {})).toBe(false);
  });
});

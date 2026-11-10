import { allMomentCells, momentCell, timeSliceBounds, timeSliceIndexOf } from "../order-moments.js";

describe("le moment de passation", () => {
  it("passe à la base les débuts de tranche, sauf le premier", () => {
    expect(timeSliceBounds()).toEqual([7, 11, 14, 18]);
  });

  it("range chaque heure locale dans sa tranche, bornes comprises au début", () => {
    expect([0, 6, 7, 10, 11, 13, 14, 17, 18, 23].map(timeSliceIndexOf)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });

  it("nomme une case depuis le jour ISO et l'index que rend la base", () => {
    expect(momentCell(1, 1)).toEqual({ key: "mon-morning", label: "Lundi, matin (7 h – 11 h)" });
    expect(momentCell(7, 4)).toEqual({
      key: "sun-evening",
      label: "Dimanche, soir (18 h – minuit)",
    });
  });

  it("refuse un jour ou une tranche hors table", () => {
    expect(momentCell(0, 1)).toBeNull();
    expect(momentCell(8, 1)).toBeNull();
    expect(momentCell(1, 5)).toBeNull();
  });

  it("compte 35 cases, lundi-nuit d'abord, dimanche-soir en dernier", () => {
    const cells = allMomentCells();
    expect(cells).toHaveLength(35);
    expect(cells[0]?.key).toBe("mon-night");
    expect(cells.at(-1)?.key).toBe("sun-evening");
  });
});

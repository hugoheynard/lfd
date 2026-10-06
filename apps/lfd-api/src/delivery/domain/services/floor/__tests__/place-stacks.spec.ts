import { CargoFloor } from "../../../value-objects/cargo-floor.js";
import { placeStacks, type StackToPlace } from "../place-stacks.js";

const GAP = 1;
const RECTANGLE = CargoFloor.of({ lengthCm: 200, widthCm: 100, heightCm: 100, wheelArches: null });

/** 60 × 40 : 61 × 41 avec le jeu. */
const m = (stackIndex: number): StackToPlace => ({
  stackIndex,
  isotherm: false,
  outerLengthMm: 600,
  outerWidthMm: 400,
});
/** 40 × 30 : 41 × 31 avec le jeu. */
const s = (stackIndex: number, isotherm = false): StackToPlace => ({
  stackIndex,
  isotherm,
  outerLengthMm: 400,
  outerWidthMm: 300,
});

describe("placeStacks — stratégie B (G-D4)", () => {
  it("remplit les rangées depuis le fond, de gauche à droite, dans l'ordre", () => {
    const placed = placeStacks(RECTANGLE, [m(1), m(2), m(3)], GAP, false);

    expect(placed.get(1)).toEqual({
      kind: "floor",
      row: 1,
      xMm: 0,
      yMm: 0,
      depthMm: 600,
      widthMm: 400,
      orientation: "length",
    });
    expect(placed.get(2)).toMatchObject({ row: 1, xMm: 0, yMm: 410 });
    // 41 + 41 + 41 > 100, et tournée elle ne tient pas mieux : rangée neuve.
    expect(placed.get(3)).toMatchObject({ row: 2, xMm: 610, yMm: 0 });
  });

  it("une rangée prend la profondeur de sa pile la plus profonde", () => {
    const placed = placeStacks(RECTANGLE, [s(1), m(2), m(3)], GAP, false);

    expect(placed.get(1)).toMatchObject({ row: 1, xMm: 0, yMm: 0 });
    expect(placed.get(2)).toMatchObject({ row: 1, xMm: 0, yMm: 310 });
    expect(placed.get(3)).toMatchObject({ row: 2, xMm: 610 });
  });

  it("tourne une pile quand seul l'autre sens tient", () => {
    const shallow = CargoFloor.of({ lengthCm: 70, widthCm: 200, heightCm: 100, wheelArches: null });
    const large: StackToPlace = {
      stackIndex: 2,
      isotherm: false,
      outerLengthMm: 800,
      outerWidthMm: 600,
    };

    const placed = placeStacks(shallow, [m(1), large], GAP, false);

    expect(placed.get(2)).toEqual({
      kind: "floor",
      row: 1,
      xMm: 0,
      yMm: 410,
      depthMm: 600,
      widthMm: 800,
      orientation: "turned",
    });
  });

  it("aucune pile sur un passage de roue : la rangée qui le touche se centre entre eux", () => {
    const arched = CargoFloor.of({
      lengthCm: 200,
      widthCm: 100,
      heightCm: 100,
      wheelArches: { lengthCm: 50, protrusionCm: 10, fromBackCm: 70, heightCm: 30 },
    });

    const placed = placeStacks(arched, [m(1), m(2), m(3), m(4)], GAP, false);

    // Rangée 2 sur [61, 122) : 80 cm libres, une seule pile, à 10 cm du flanc.
    expect(placed.get(3)).toMatchObject({ row: 2, xMm: 610, yMm: 100 });
    expect(placed.get(4)).toMatchObject({ row: 3, xMm: 1220, yMm: 0 });
  });

  it("une pile qui ne tient pas sort du plancher, et toutes les suivantes avec elle", () => {
    const stacks = [1, 2, 3, 4, 5, 6, 7].map(m);

    const placed = placeStacks(RECTANGLE, [...stacks, s(8)], GAP, false);

    expect([1, 2, 3, 4, 5, 6].map((index) => placed.get(index)?.kind)).toEqual(
      Array.from({ length: 6 }, () => "floor"),
    );
    expect(placed.get(7)).toEqual({ kind: "off_floor" });
    // Le petit bac tiendrait dans un coin : il est chargé APRÈS, donc devant.
    expect(placed.get(8)).toEqual({ kind: "off_floor" });
  });

  it("les isothermes vont à la caisse réfrigérée, sinon au sol", () => {
    expect(placeStacks(RECTANGLE, [s(1, true), m(2)], GAP, true).get(1)).toEqual({
      kind: "refrigerated",
    });
    expect(placeStacks(RECTANGLE, [s(1, true), m(2)], GAP, true).get(2)).toMatchObject({
      row: 1,
      yMm: 0,
    });
    expect(placeStacks(RECTANGLE, [s(1, true)], GAP, false).get(1)).toMatchObject({
      kind: "floor",
    });
  });
});

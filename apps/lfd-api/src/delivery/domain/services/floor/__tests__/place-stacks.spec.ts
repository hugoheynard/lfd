import { CargoFloor } from "../../../value-objects/cargo-floor.js";
import { FloorPlacer, placeStacks, type StackToPlace } from "../place-stacks.js";

const GAP = 1;
/** 25 cm : quatre étages sous un plafond de 100 cm. */
const HEIGHT_MM = 250;
const RECTANGLE = CargoFloor.of({ lengthCm: 200, widthCm: 100, heightCm: 100, wheelArches: null });

/** 60 × 40 : 61 × 41 avec le jeu. */
const m = (stackIndex: number): StackToPlace => ({
  stackIndex,
  isotherm: false,
  outerLengthMm: 600,
  outerWidthMm: 400,
  outerHeightMm: HEIGHT_MM,
  maxStack: 4,
});
/** 40 × 30 : 41 × 31 avec le jeu. */
const s = (stackIndex: number, isotherm = false): StackToPlace => ({
  stackIndex,
  isotherm,
  outerLengthMm: 400,
  outerWidthMm: 300,
  outerHeightMm: HEIGHT_MM,
  maxStack: 4,
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
      overArch: null,
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
      outerHeightMm: HEIGHT_MM,
      maxStack: 4,
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
      overArch: null,
    });
  });

  it("aucune pile sur un passage de roue : la rangée qui le touche se centre entre eux", () => {
    const arched = CargoFloor.of({
      lengthCm: 200,
      widthCm: 100,
      heightCm: 100,
      // Hauteur non mesurée : rien ne monte au-dessus (G5b, testé plus bas).
      wheelArches: { lengthCm: 50, protrusionCm: 10, fromBackCm: 70, heightCm: null },
    });

    const placed = placeStacks(arched, [m(1), m(2), m(3), m(4)], GAP, false);

    // Rangée 2 sur [61, 122) : 80 cm libres, une seule pile, à 10 cm du flanc.
    expect(placed.get(3)).toMatchObject({ row: 2, xMm: 610, yMm: 100 });
    expect(placed.get(4)).toMatchObject({ row: 3, xMm: 1220, yMm: 0 });
  });

  /**
   * G5c (Hugo, 2026-10-08 : « livrer emporte sur léger désordre ») : jusque-là,
   * la pile sortie emmenait toutes les suivantes, et le petit bac restait au
   * dépôt alors qu'il tenait dans un coin.
   */
  it("une pile qui ne tient pas sort seule : la suivante, plus petite, se pose encore", () => {
    // 220 cm : trois rangées de 61 cm laissent 37 cm — pas assez pour un
    // 60 × 40 même tourné (41), assez pour un 40 × 30 tourné (31).
    const floor = CargoFloor.of({ lengthCm: 220, widthCm: 100, heightCm: 100, wheelArches: null });
    const stacks = [1, 2, 3, 4, 5, 6, 7].map(m);

    const placed = placeStacks(floor, [...stacks, s(8)], GAP, false);

    expect([1, 2, 3, 4, 5, 6].map((index) => placed.get(index)?.kind)).toEqual(
      Array.from({ length: 6 }, () => "floor"),
    );
    expect(placed.get(7)).toEqual({ kind: "off_floor" });
    expect(placed.get(8)).toMatchObject({
      kind: "floor",
      row: 4,
      xMm: 1830,
      orientation: "turned",
    });
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

describe("placeStacks — au-dessus d'un passage de roue (G5b, 2026-10-08)", () => {
  /** Passages sur [70, 120) cm, 10 cm de saillie : 80 cm libres au sol entre eux. */
  const arched = (heightCm: number | null) =>
    CargoFloor.of({
      lengthCm: 200,
      widthCm: 100,
      heightCm: 100,
      wheelArches: { lengthCm: 50, protrusionCm: 10, fromBackCm: 70, heightCm },
    });

  it("une pile qui ne tient plus au sol de la rangée monte au-dessus d'un passage, à partir de k₀", () => {
    const placed = placeStacks(arched(30), [m(1), m(2), m(3), m(4), m(5)], GAP, false);

    // Rangée 2 sur [61, 122) : une pile au sol, la seconde au-dessus du
    // passage gauche — k₀ = ⌈300 ÷ 250⌉ = 2, et 4 − 2 = 2 étages.
    expect(placed.get(4)).toEqual({
      kind: "floor",
      row: 2,
      xMm: 610,
      yMm: 0,
      depthMm: 600,
      widthMm: 400,
      orientation: "length",
      overArch: { side: "left", fromLevel: 2, levels: 2 },
    });
    // La pile au sol se range à droite de la bande du passage.
    expect(placed.get(3)).toMatchObject({ row: 2, yMm: 410, overArch: null });
    // Plus de place ni au sol ni au-dessus : rangée neuve.
    expect(placed.get(5)).toMatchObject({ row: 3, xMm: 1220, overArch: null });
  });

  it("sans hauteur de passage mesurée, rien n'y monte : comme avant", () => {
    const placed = placeStacks(arched(null), [m(1), m(2), m(3), m(4)], GAP, false);

    expect(placed.get(3)).toMatchObject({ row: 2, yMm: 100, overArch: null });
    expect(placed.get(4)).toMatchObject({ row: 3, xMm: 1220, overArch: null });
  });

  it("un passage plus haut que les étages de la pile : rien n'y monte", () => {
    // k₀ = ⌈800 ÷ 250⌉ = 4 : aucun étage libre au-dessus.
    const placed = placeStacks(arched(80), [m(1), m(2), m(3), m(4)], GAP, false);

    expect(placed.get(4)).toMatchObject({ row: 3, overArch: null });
  });

  it("borne la pile au-dessus d'un passage à étages − k₀ ; au sol, la règle du plafond", () => {
    const placer = new FloorPlacer(arched(30), GAP, false);
    for (const stack of [m(1), m(2), m(3), m(4)]) {
      placer.place(stack);
    }
    const binType = { isotherm: false, outerHeightMm: HEIGHT_MM, maxStack: 4 };

    expect(placer.levelsOf(binType, 4)).toBe(2);
    expect(placer.levelsOf(binType, 3)).toBe(4);
    expect(placer.levelsOf(binType)).toBe(4);
  });
});

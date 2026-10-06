import { CargoFloor } from "../../../value-objects/cargo-floor.js";
import { floorInMm, freeWidthMm, stackLevels } from "../floor-geometry.js";

/** Le plancher se mesure en cm, la géométrie en mm : ces cas restent écrits en cm. */
const freeWidthCm = (floor: CargoFloor, fromCm: number, depthCm: number): number =>
  freeWidthMm(floorInMm(floor), fromCm * 10, depthCm * 10) / 10;

const VAN = { lengthCm: 290, widthCm: 166, heightCm: 139 };
const withArches = (fromBackCm: number, protrusionCm = 20): CargoFloor =>
  CargoFloor.of({ ...VAN, wheelArches: { lengthCm: 90, protrusionCm, fromBackCm } });

describe("freeWidthMm", () => {
  it("rend toute la largeur d'un rectangle", () => {
    expect(freeWidthCm(CargoFloor.of({ ...VAN, wheelArches: null }), 0, 290)).toBe(166);
  });

  it("retire deux saillies sur une tranche qui touche le passage", () => {
    expect(freeWidthCm(withArches(60), 100, 10)).toBe(126);
  });

  it("une tranche qui effleure le passage sans le toucher garde la largeur pleine", () => {
    const floor = withArches(60); // passage [60, 150)
    expect(freeWidthCm(floor, 0, 60)).toBe(166);
    expect(freeWidthCm(floor, 150, 61)).toBe(166);
    expect(freeWidthCm(floor, 0, 61)).toBe(126);
    expect(freeWidthCm(floor, 149, 61)).toBe(126);
  });

  it("un passage au ras du fond touche la toute première tranche", () => {
    const floor = withArches(0); // passage [0, 90)
    expect(freeWidthCm(floor, 0, 1)).toBe(126);
    expect(freeWidthCm(floor, 90, 61)).toBe(166);
  });

  it("une saillie proche de la demi-largeur ne laisse qu'un centimètre", () => {
    expect(freeWidthCm(withArches(60, 82), 60, 1)).toBe(2);
    expect(
      freeWidthCm(
        CargoFloor.of({
          ...VAN,
          widthCm: 165,
          wheelArches: { lengthCm: 90, protrusionCm: 82, fromBackCm: 60 },
        }),
        60,
        1,
      ),
    ).toBe(1);
  });
});

describe("stackLevels", () => {
  const floor = CargoFloor.of({ ...VAN, wheelArches: null });

  it("est limité par le plafond : ⌊139 ÷ 32⌋ = 4 < 5", () => {
    expect(stackLevels(floorInMm(floor), 320, 5)).toBe(4);
  });

  it("est limité par la pile quand le plafond laisse plus", () => {
    expect(stackLevels(floorInMm(floor), 320, 3)).toBe(3);
  });

  it("un bac qui touche pile le plafond compte un étage", () => {
    expect(stackLevels(floorInMm(floor), 1390, 5)).toBe(1);
  });

  it("vaut zéro pour un bac plus haut que le plafond", () => {
    expect(stackLevels(floorInMm(floor), 1400, 5)).toBe(0);
  });
});

describe("floorInMm", () => {
  it("convertit le plancher ×10, passages compris — sans perte", () => {
    const floor = CargoFloor.of({
      ...VAN,
      wheelArches: { lengthCm: 90, protrusionCm: 20, fromBackCm: 60, heightCm: 30 },
    });
    expect(floorInMm(floor)).toEqual({
      lengthMm: 2900,
      widthMm: 1660,
      heightMm: 1390,
      wheelArches: { fromBackMm: 600, endMm: 1500, protrusionMm: 200, heightMm: 300 },
    });
  });

  it("un bac de 665 mm se pose contre un passage qui commence à 66,5 cm sans le toucher", () => {
    // Le plancher reste en cm : c'est le bac au millimètre qui décide.
    const floor = floorInMm(withArches(67));
    expect(freeWidthMm(floor, 0, 665)).toBe(1660);
    expect(freeWidthMm(floor, 0, 671)).toBe(1260);
  });
});

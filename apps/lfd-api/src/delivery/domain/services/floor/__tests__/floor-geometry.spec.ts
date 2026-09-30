import { CargoFloor } from "../../../value-objects/cargo-floor.js";
import { freeWidthCm, stackLevels } from "../floor-geometry.js";

const VAN = { lengthCm: 290, widthCm: 166, heightCm: 139 };
const withArches = (fromBackCm: number, protrusionCm = 20): CargoFloor =>
  CargoFloor.of({ ...VAN, wheelArches: { lengthCm: 90, protrusionCm, fromBackCm } });

describe("freeWidthCm", () => {
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
    expect(stackLevels(floor, 32, 5)).toBe(4);
  });

  it("est limité par la pile quand le plafond laisse plus", () => {
    expect(stackLevels(floor, 32, 3)).toBe(3);
  });

  it("un bac qui touche pile le plafond compte un étage", () => {
    expect(stackLevels(floor, 139, 5)).toBe(1);
  });

  it("vaut zéro pour un bac plus haut que le plafond", () => {
    expect(stackLevels(floor, 140, 5)).toBe(0);
  });
});

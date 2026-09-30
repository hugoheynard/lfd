import { InvalidCargoDimensionsError } from "../../errors/delivery-errors.js";
import { InvalidWheelArchesError } from "../../errors/delivery-floor-errors.js";
import { CargoFloor } from "../cargo-floor.js";
import { WheelArches } from "../wheel-arches.js";

const VAN = { lengthCm: 290, widthCm: 166, heightCm: 139 };

describe("WheelArches", () => {
  it("accepte un passage au ras du fond (distance 0)", () => {
    expect(WheelArches.of({ lengthCm: 90, protrusionCm: 20, fromBackCm: 0 }).endCm).toBe(90);
  });

  it.each([
    [{ lengthCm: 0, protrusionCm: 20, fromBackCm: 60 }, /longueur vaut 0 cm/u],
    [{ lengthCm: 90, protrusionCm: 0, fromBackCm: 60 }, /saillie vaut 0 cm/u],
    [{ lengthCm: 90, protrusionCm: 20, fromBackCm: -1 }, /depuis le fond vaut -1 cm/u],
    [{ lengthCm: 90, protrusionCm: 20.5, fromBackCm: 60 }, /saillie vaut 20.5 cm/u],
  ])("refuse %j en nommant la cote", (input, detail) => {
    expect(() => WheelArches.of(input)).toThrow(InvalidWheelArchesError);
    expect(() => WheelArches.of(input)).toThrow(detail);
  });

  it("touche selon des bornes semi-ouvertes [x, x + d)", () => {
    const arches = WheelArches.of({ lengthCm: 90, protrusionCm: 20, fromBackCm: 60 });
    expect(arches.touches(0, 60)).toBe(false); // s'arrête où le passage commence
    expect(arches.touches(0, 61)).toBe(true);
    expect(arches.touches(150, 40)).toBe(false); // commence où il finit
    expect(arches.touches(149, 40)).toBe(true);
  });
});

describe("CargoFloor", () => {
  it("reprend les dimensions et le volume de CargoSpace", () => {
    const floor = CargoFloor.of({ ...VAN, wheelArches: null });
    expect([floor.lengthCm, floor.widthCm, floor.heightCm]).toEqual([290, 166, 139]);
    expect(floor.volumeLiters).toBe(6691);
    expect(floor.wheelArches).toBeNull();
  });

  it("refuse une dimension hors bornes par l'erreur de CargoSpace", () => {
    expect(() => CargoFloor.of({ ...VAN, widthCm: 1001, wheelArches: null })).toThrow(
      InvalidCargoDimensionsError,
    );
  });

  it("accepte une saillie juste sous la demi-largeur (1 cm entre les passages)", () => {
    const floor = CargoFloor.of({
      ...VAN,
      wheelArches: { lengthCm: 90, protrusionCm: 82, fromBackCm: 60 },
    });
    expect(floor.wheelArches?.protrusionCm).toBe(82);
  });

  it.each([83, 84])("refuse une saillie de %i cm sur 166 cm (≥ demi-largeur)", (protrusionCm) => {
    const build = (): CargoFloor =>
      CargoFloor.of({ ...VAN, wheelArches: { lengthCm: 90, protrusionCm, fromBackCm: 60 } });
    expect(build).toThrow(InvalidWheelArchesError);
    expect(build).toThrow(/ne laisse rien entre les passages/u);
  });

  it("accepte un passage qui finit contre les portes, refuse celui qui en sort", () => {
    const at = (fromBackCm: number): CargoFloor =>
      CargoFloor.of({ ...VAN, wheelArches: { lengthCm: 90, protrusionCm: 20, fromBackCm } });
    expect(at(200).wheelArches?.endCm).toBe(290);
    expect(() => at(201)).toThrow(/sort d'un plancher de 290 cm de long/u);
  });
});

import { BinInnerExceedsOuterError } from "../../../errors/delivery-bin-errors.js";
import { BinFormat } from "../../../value-objects/bin-format.js";
import { CargoFloor } from "../../../value-objects/cargo-floor.js";
import { geometryOf, geometryOfFormat } from "../format-geometry.js";
import { maximizeFormat } from "../maximize-format.js";

const MANNE = {
  outer: { lengthMm: 665, widthMm: 460, heightMm: 715 },
  inner: { lengthMm: 645, widthMm: 440, heightMm: 695 },
  maxStack: 1,
};

describe("geometryOfFormat", () => {
  it("rend un format au millimètre tel quel : plus aucune conversion", () => {
    expect(geometryOfFormat(BinFormat.of(MANNE))).toEqual(MANNE);
  });
});

describe("geometryOf", () => {
  it("garde un type au millimètre tel quel", () => {
    expect(geometryOf(MANNE)).toEqual(MANNE);
  });

  it("revalide par les règles du type : l'intérieur tient dans l'extérieur", () => {
    expect(() => geometryOf({ ...MANNE, inner: { ...MANNE.inner, heightMm: 716 } })).toThrow(
      BinInnerExceedsOuterError,
    );
  });
});

describe("maximizeFormat — un type au millimètre face à un plancher en centimètres", () => {
  const floorOf = (lengthCm: number): CargoFloor =>
    CargoFloor.of({ lengthCm, widthCm: 48, heightCm: 100, wheelArches: null });

  it("665 mm + 1 cm de jeu tiennent dans 68 cm, pas dans 67", () => {
    expect(maximizeFormat(floorOf(68), geometryOf(MANNE), 1).total).toBe(1);
    expect(maximizeFormat(floorOf(67), geometryOf(MANNE), 1).total).toBe(0);
  });

  it("rend ses rangées en millimètres", () => {
    expect(maximizeFormat(floorOf(68), geometryOf(MANNE), 1).rows).toEqual([
      {
        fromMm: 0,
        depthMm: 675,
        count: 1,
        orientation: "length",
        overArchCount: 0,
        overArchFromLevel: null,
        total: 1,
      },
    ]);
  });
});

import {
  BinInnerExceedsOuterError,
  BinTypeAlreadyArchivedError,
  BinTypeArchivedForCapacityError,
  BinTypeNotArchivedError,
  InvalidBinCapacityError,
  InvalidBinDimensionsError,
  InvalidBinMaxStackError,
  InvalidBinTypeNameError,
} from "../../errors/delivery-bin-errors.js";
import { BinCapacity } from "../bin-capacity.js";
import { BinType, type BinTypeSpec } from "../bin-type.js";

const AT = new Date(0);
const LATER = new Date(60_000);

/** Un bac Euronorm 60 × 40 × 22, intérieur 56 × 36 × 20. */
const SPEC: BinTypeSpec = {
  name: "Bac M",
  outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 20 },
  isotherm: false,
  maxStack: 6,
  divisible: true,
};

function declared(spec: Partial<BinTypeSpec> = {}): BinType {
  return BinType.declare({ ...SPEC, ...spec, id: "bin_1", at: AT });
}

describe("BinType", () => {
  it("se déclare en service, nom rogné, volume intérieur dérivé", () => {
    const bin = declared({ name: "  Bac M  " });

    expect(bin.name).toBe("Bac M");
    expect(bin.inService).toBe(true);
    expect(bin.inner.volumeLiters).toBe(40); // 56 × 36 × 20 = 40 320 cm³
    expect(bin.toState()).toMatchObject({ ...SPEC, archivedAt: null, createdAt: AT });
  });

  it.each([
    ["vide", "   "],
    ["trop long", "x".repeat(61)],
  ])("refuse un nom %s", (_label, name) => {
    expect(() => declared({ name })).toThrow(InvalidBinTypeNameError);
  });

  it.each([0, 301, 12.5])("refuse une dimension de %s cm, en nommant le côté", (lengthCm) => {
    expect(() => declared({ outer: { ...SPEC.outer, lengthCm } })).toThrow(
      /Dimensions extérieures du bac : la longueur vaut/,
    );
    expect(() => declared({ outer: { ...SPEC.outer, lengthCm } })).toThrow(
      InvalidBinDimensionsError,
    );
  });

  it("refuse un intérieur plus haut que l'extérieur, en nommant la dimension", () => {
    expect(() => declared({ inner: { ...SPEC.inner, heightCm: 23 } })).toThrow(
      BinInnerExceedsOuterError,
    );
    expect(() => declared({ inner: { ...SPEC.inner, heightCm: 23 } })).toThrow(
      "La hauteur intérieure (23 cm) dépasse la hauteur extérieure (22 cm)",
    );
  });

  it("admet un intérieur égal à l'extérieur", () => {
    expect(declared({ inner: SPEC.outer }).inner.toInput()).toEqual(SPEC.outer);
  });

  it.each([0, 21, 1.5])("refuse une pile de %s", (maxStack) => {
    expect(() => declared({ maxStack })).toThrow(InvalidBinMaxStackError);
  });

  it("se corrige en entier, sans toucher un champ si la fiche est refusée", () => {
    const bin = declared();

    expect(() => bin.correct({ ...SPEC, name: "Bac L", maxStack: 0 }, LATER)).toThrow(
      InvalidBinMaxStackError,
    );
    expect(bin.name).toBe("Bac M");

    bin.correct({ ...SPEC, name: "Bac L", isotherm: true }, LATER);
    expect(bin.specification).toEqual({ ...SPEC, name: "Bac L", isotherm: true });
    expect(bin.updatedAt).toBe(LATER);
  });

  it("s'archive une fois, se réactive une fois", () => {
    const bin = declared();

    bin.archive(LATER);
    expect(bin.archivedAt).toBe(LATER);
    expect(() => bin.archive(LATER)).toThrow(BinTypeAlreadyArchivedError);

    bin.reactivate(LATER);
    expect(bin.inService).toBe(true);
    expect(() => bin.reactivate(LATER)).toThrow(BinTypeNotArchivedError);
  });

  it("refuse une contenance sur un type archivé", () => {
    const bin = declared();
    expect(() => bin.ensureAcceptsCapacity()).not.toThrow();

    bin.archive(LATER);
    expect(() => bin.ensureAcceptsCapacity()).toThrow(BinTypeArchivedForCapacityError);
  });

  it("se réhydrate à l'identique", () => {
    const bin = declared();
    bin.archive(LATER);

    expect(BinType.restore(bin.toState()).toState()).toEqual(bin.toState());
  });
});

describe("BinCapacity", () => {
  it("porte des unités entières de 1 à 10 000", () => {
    expect(BinCapacity.of({ binTypeId: "bin_1", sku: "VIE-001", units: 24 }).units).toBe(24);
    expect(BinCapacity.of({ binTypeId: "bin_1", sku: "VIE-001", units: 10_000 }).units).toBe(
      10_000,
    );
  });

  it.each([0, -3, 10_001, 2.5])("refuse %s unités — une case vide se retire", (units) => {
    expect(() => BinCapacity.of({ binTypeId: "bin_1", sku: "VIE-001", units })).toThrow(
      InvalidBinCapacityError,
    );
  });
});

import { BinType } from "../../entities/bin-type.js";
import { Vehicle } from "../../entities/vehicle.js";
import {
  LastActiveBinTypeError,
  LastMeasuredVehicleError,
  NoActiveBinTypeError,
  NoMeasuredVehicleError,
} from "../../errors/delivery-composition-errors.js";
import {
  ensureActiveBinTypeRemains,
  ensureComposable,
  ensureMeasuredVehicleRemains,
} from "../composition-prerequisites.js";

const AT = new Date(0);
const CARGO = { lengthCm: 200, widthCm: 120, heightCm: 120 };

function measured(id: string): Vehicle {
  return Vehicle.register({ id, name: `Véhicule ${id}`, plate: "AB-123-CD", cargo: CARGO, at: AT });
}

function bin(id: string): BinType {
  return BinType.declare({
    id,
    name: `Bac ${id}`,
    outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
    inner: { lengthCm: 56, widthCm: 36, heightCm: 20 },
    isotherm: false,
    maxStack: 6,
    divisible: true,
    at: AT,
  });
}

describe("Vehicle.measured (Q5 : les cotes suffisent)", () => {
  it("en service avec ses cotes : mesuré, sans passages de roue ni froid", () => {
    expect(measured("v1").measured).toBe(true);
  });

  it("sans cotes, ou retiré : pas mesuré", () => {
    const bare = Vehicle.register({ id: "v1", name: "Kangoo", plate: "AB-123-CD", at: AT });
    const retired = measured("v2");
    retired.retire(AT);
    expect(bare.measured).toBe(false);
    expect(retired.measured).toBe(false);
  });
});

describe("ensureComposable", () => {
  it("passe avec un véhicule mesuré et un type de bac", () => {
    expect(() =>
      ensureComposable({ measuredVehicleIds: ["v1"], activeBinTypeIds: ["b1"] }),
    ).not.toThrow();
  });

  it("refuse sans véhicule mesuré, en disant où régler", () => {
    expect(() => ensureComposable({ measuredVehicleIds: [], activeBinTypeIds: ["b1"] })).toThrow(
      NoMeasuredVehicleError,
    );
    expect(() => ensureComposable({ measuredVehicleIds: [], activeBinTypeIds: ["b1"] })).toThrow(
      /Livraison → Véhicules avant de proposer des tournées/u,
    );
  });

  it("refuse sans type de bac en service", () => {
    expect(() => ensureComposable({ measuredVehicleIds: ["v1"], activeBinTypeIds: [] })).toThrow(
      NoActiveBinTypeError,
    );
  });

  it("sans rien : le véhicule est nommé d'abord", () => {
    expect(() => ensureComposable({ measuredVehicleIds: [], activeBinTypeIds: [] })).toThrow(
      NoMeasuredVehicleError,
    );
  });
});

describe("ensureMeasuredVehicleRemains", () => {
  it("refuse quand le véhicule était le seul mesuré et ne l'est plus", () => {
    const vehicle = measured("v1");
    vehicle.retire(AT);
    expect(() =>
      ensureMeasuredVehicleRemains({
        vehicle,
        wasMeasured: true,
        measuredIds: ["v1"],
        gesture: "retire",
      }),
    ).toThrow(LastMeasuredVehicleError);
  });

  it("passe quand un autre reste mesuré", () => {
    const vehicle = measured("v1");
    vehicle.retire(AT);
    expect(() =>
      ensureMeasuredVehicleRemains({
        vehicle,
        wasMeasured: true,
        measuredIds: ["v1", "v2"],
        gesture: "retire",
      }),
    ).not.toThrow();
  });

  it("passe quand il n'était pas mesuré : une flotte déjà vide ne se fige pas", () => {
    const vehicle = Vehicle.register({ id: "v1", name: "Kangoo", plate: "AB-123-CD", at: AT });
    vehicle.retire(AT);
    expect(() =>
      ensureMeasuredVehicleRemains({
        vehicle,
        wasMeasured: false,
        measuredIds: [],
        gesture: "retire",
      }),
    ).not.toThrow();
  });

  it("passe quand il l'est encore (cotes corrigées, pas effacées)", () => {
    expect(() =>
      ensureMeasuredVehicleRemains({
        vehicle: measured("v1"),
        wasMeasured: true,
        measuredIds: ["v1"],
        gesture: "erase_cargo",
      }),
    ).not.toThrow();
  });
});

describe("ensureActiveBinTypeRemains", () => {
  it("refuse d'archiver le seul type en service", () => {
    expect(() => ensureActiveBinTypeRemains(bin("b1"), ["b1"])).toThrow(LastActiveBinTypeError);
  });

  it("passe quand un autre reste en service", () => {
    expect(() => ensureActiveBinTypeRemains(bin("b1"), ["b1", "b2"])).not.toThrow();
  });

  it("passe sur un type déjà archivé : son propre refus le dira", () => {
    const archived = bin("b1");
    archived.archive(AT);
    expect(() => ensureActiveBinTypeRemains(archived, [])).not.toThrow();
  });
});

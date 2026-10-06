import type { VehiclePayload } from "@lfd/contracts";

import { Vehicle } from "../../../delivery/domain/entities/vehicle.js";
import { placeStacks } from "../../../delivery/domain/services/floor/place-stacks.js";
import { BIN_GAP_MAX_CM } from "../../../delivery/domain/value-objects/bin-gap.js";
import { CargoFloor } from "../../../delivery/domain/value-objects/cargo-floor.js";
import { FLEET, fleetCorrection, type SeededVehicleRow } from "../delivery-fleet.seed.js";

/**
 * La flotte semée porte ses cotes : sans elles, le plan de chargement ne
 * dessinait pas de plancher en dev (G5/G6 invisibles avant le 2026-10-03).
 */

const AT = new Date(0);

function seeded(name: string): VehiclePayload {
  const vehicle = FLEET.find((candidate) => candidate.name === name);
  if (vehicle === undefined) {
    throw new Error(`${name} absente de la flotte semée`);
  }
  return vehicle;
}

function bareRow(overrides: Partial<SeededVehicleRow> = {}): SeededVehicleRow {
  return {
    name: "Camionnette 1",
    plate: "FG-481-KL",
    cargoLengthCm: null,
    wheelArchLengthCm: null,
    refrigeratedVolumeLiters: null,
    energy: null,
    ...overrides,
  };
}

describe("FLEET", () => {
  it("chaque camionnette a des dimensions utiles que l'agrégat accepte", () => {
    for (const [index, vehicle] of FLEET.entries()) {
      expect(vehicle.cargo).not.toBeNull();
      expect(() => Vehicle.register({ ...vehicle, id: `v${index}`, at: AT })).not.toThrow();
    }
  });

  it("au moins une a ses passages de roue, et une autre une caisse réfrigérée", () => {
    expect(FLEET.some((vehicle) => vehicle.wheelArches != null)).toBe(true);
    expect(FLEET.some((vehicle) => vehicle.refrigeration != null)).toBe(true);
  });

  it("la tournée semée (Camionnette 1) tient au sol, même au jeu maximal", () => {
    const vehicle = seeded("Camionnette 1");
    const floor = CargoFloor.of({
      lengthCm: vehicle.cargo?.lengthCm ?? 0,
      widthCm: vehicle.cargo?.widthCm ?? 0,
      heightCm: vehicle.cargo?.heightCm ?? 0,
      wheelArches: vehicle.wheelArches ?? null,
    });
    // La tournée de `delivery-day.seed.ts` porte une dizaine de bacs de trois
    // types, que le plan empile par type (`maxStack` du semis) : quelques
    // piles. Huit piles à l'empreinte d'un Bac L, au jeu maximal, en laissent
    // large.
    const stacks = Array.from({ length: 8 }, (_, stackIndex) => ({
      stackIndex,
      isotherm: false,
      outerLengthMm: 600,
      outerWidthMm: 400,
    }));

    const placements = placeStacks(floor, stacks, BIN_GAP_MAX_CM, false);

    expect([...placements.values()].every((placement) => placement.kind === "floor")).toBe(true);
  });
});

describe("fleetCorrection", () => {
  it("pose les cotes du semis sur une camionnette qui n'en a aucune, nom et énergie gardés", () => {
    const correction = fleetCorrection(
      bareRow({ name: "Kangoo blanc", energy: "electric" }),
      seeded("Camionnette 1"),
    );

    expect(correction).toEqual({
      ...seeded("Camionnette 1"),
      name: "Kangoo blanc",
      energy: "electric",
    });
  });

  it("prend l'énergie du semis quand la base n'en dit rien", () => {
    expect(fleetCorrection(bareRow(), seeded("Camionnette 1"))?.energy).toBe("diesel");
  });

  it.each([
    ["des dimensions", { cargoLengthCm: 300 }],
    ["des passages de roue", { wheelArchLengthCm: 80 }],
    ["une caisse réfrigérée", { refrigeratedVolumeLiters: 900 }],
  ])("ne touche pas à une camionnette qui a déjà %s", (_label, overrides) => {
    expect(fleetCorrection(bareRow(overrides), seeded("Camionnette 1"))).toBeNull();
  });
});

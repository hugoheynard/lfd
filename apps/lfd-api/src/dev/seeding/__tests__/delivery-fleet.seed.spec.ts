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
    cargoWidthCm: null,
    cargoHeightCm: null,
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

  /** Les cotes du Ford Transit City L2H2 (Hugo, 2026-10-14), version inconnue : la plus grande. */
  it("toutes portent les cotes utiles du Transit City L2H2, et une caisse réfrigérée", () => {
    for (const vehicle of FLEET) {
      expect(vehicle.cargo).toEqual({ lengthCm: 294, widthCm: 174, heightCm: 171 });
    }
    expect(FLEET.some((vehicle) => vehicle.refrigeration != null)).toBe(true);
  });

  it("n'invente aucun passage de roue : leurs cotes ne sont pas connues", () => {
    expect(FLEET.every((vehicle) => vehicle.wheelArches == null)).toBe(true);
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
      outerHeightMm: 300,
      maxStack: 3,
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

  it("ne touche pas à une camionnette déjà aux cotes du semis", () => {
    const row = bareRow({ cargoLengthCm: 294, cargoWidthCm: 174, cargoHeightCm: 171 });

    expect(fleetCorrection(row, seeded("Camionnette 1"))).toBeNull();
  });

  /** Régression : une cote déjà renseignée n'était jamais reprise, la flotte restait aux cotes d'avant le Transit City. */
  it.each([
    ["d'anciennes dimensions", { cargoLengthCm: 260, cargoWidthCm: 166, cargoHeightCm: 145 }],
    ["des passages de roue inventés", { wheelArchLengthCm: 90 }],
    ["une caisse réfrigérée que le semis ne lui donne pas", { refrigeratedVolumeLiters: 900 }],
  ])("repose les cotes du semis sur une camionnette qui a %s", (_label, overrides) => {
    const row = bareRow({
      cargoLengthCm: 294,
      cargoWidthCm: 174,
      cargoHeightCm: 171,
      ...overrides,
    });

    expect(fleetCorrection(row, seeded("Camionnette 1"))?.cargo).toEqual(
      seeded("Camionnette 1").cargo,
    );
  });
});

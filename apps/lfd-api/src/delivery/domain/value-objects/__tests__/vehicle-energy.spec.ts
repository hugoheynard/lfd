import { InvalidVehicleEnergyError } from "../../errors/delivery-errors.js";
import { VEHICLE_ENERGIES, vehicleEnergyOf } from "../vehicle-energy.js";

describe("vehicleEnergyOf", () => {
  it.each(VEHICLE_ENERGIES)("reconnaît « %s »", (energy) => {
    expect(vehicleEnergyOf(energy)).toBe(energy);
  });

  it.each(["", "Electric", "gpl", "hydrogen"])(
    "refuse « %s », en nommant les choix possibles",
    (raw) => {
      expect(() => vehicleEnergyOf(raw)).toThrow(InvalidVehicleEnergyError);
      expect(() => vehicleEnergyOf(raw)).toThrow(/gaz \(GNV\/GPL\), ou laissez-la non renseignée/u);
    },
  );
});

import {
  InvalidLicensePlateError,
  InvalidVehicleNameError,
  VehicleAlreadyRetiredError,
  VehicleNotRetiredError,
} from "../../errors/delivery-errors.js";
import { Vehicle } from "../vehicle.js";

const CREATED = new Date(0);
const LATER = new Date(60_000);
const MUCH_LATER = new Date(120_000);

function kangoo(): Vehicle {
  return Vehicle.register({ id: "v_1", name: "  Kangoo blanc ", plate: "ab 123 cd", at: CREATED });
}

describe("Vehicle", () => {
  it("entre dans la flotte en service, nom rogné et plaque normalisée", () => {
    const vehicle = kangoo();
    expect(vehicle.toState()).toEqual({
      id: "v_1",
      name: "Kangoo blanc",
      plate: "AB-123-CD",
      retiredAt: null,
      createdAt: CREATED,
      updatedAt: CREATED,
    });
    expect(vehicle.inService).toBe(true);
  });

  it("refuse un nom vide ou trop long, et une plaque mal formée", () => {
    const base = { id: "v_1", plate: "AB-123-CD", at: CREATED };
    expect(() => Vehicle.register({ ...base, name: "   " })).toThrow(InvalidVehicleNameError);
    expect(() => Vehicle.register({ ...base, name: "x".repeat(61) })).toThrow(
      InvalidVehicleNameError,
    );
    expect(() => Vehicle.register({ ...base, name: "Kangoo", plate: "AB-12" })).toThrow(
      InvalidLicensePlateError,
    );
  });

  it("se retire à la date du geste, et sa date ne se réécrit pas", () => {
    const vehicle = kangoo();
    vehicle.retire(LATER);
    expect(vehicle.retiredAt).toEqual(LATER);
    expect(vehicle.updatedAt).toEqual(LATER);
    expect(() => vehicle.retire(MUCH_LATER)).toThrow(VehicleAlreadyRetiredError);
    expect(() => vehicle.retire(MUCH_LATER)).toThrow(/Kangoo blanc/u);
    expect(vehicle.retiredAt).toEqual(LATER);
  });

  it("se réactive s'il est retiré, et refuse s'il roule", () => {
    const vehicle = kangoo();
    expect(() => vehicle.reactivate(LATER)).toThrow(VehicleNotRetiredError);
    vehicle.retire(LATER);
    vehicle.reactivate(MUCH_LATER);
    expect(vehicle.inService).toBe(true);
    expect(vehicle.updatedAt).toEqual(MUCH_LATER);
  });

  it("se corrige, même retiré, sans être remis en service", () => {
    const vehicle = kangoo();
    vehicle.retire(LATER);
    vehicle.correct({ name: "Kangoo gris", plate: "EF456GH" }, MUCH_LATER);
    expect(vehicle.name).toBe("Kangoo gris");
    expect(vehicle.plate.value).toBe("EF-456-GH");
    expect(vehicle.inService).toBe(false);
  });

  it("se réhydrate et revalide sa plaque", () => {
    const state = { ...kangoo().toState(), plate: "n'importe quoi" };
    expect(() => Vehicle.restore(state)).toThrow(InvalidLicensePlateError);
    expect(Vehicle.restore(kangoo().toState()).toState()).toEqual(kangoo().toState());
  });
});

import {
  InvalidLicensePlateError,
  InvalidVehicleNameError,
  VehicleAlreadyRetiredError,
  VehicleNotRetiredError,
} from "../../errors/delivery-errors.js";
import { activeOnDay, Vehicle } from "../vehicle.js";

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

describe("« actif ce jour-là » (C5, corrigé par C14)", () => {
  // Des jours comparés à une date de retrait écrite dans le test, jamais à l'horloge.
  it("un véhicule en service est actif tous les jours", () => {
    expect(activeOnDay(null, "2030-03-12")).toBe(true);
  });

  it("retiré le jour J (Paris) : actif J, plus J+1", () => {
    const retiredAt = new Date("2030-03-12T15:00:00.000Z");
    expect(activeOnDay(retiredAt, "2030-03-11")).toBe(true);
    expect(activeOnDay(retiredAt, "2030-03-12")).toBe(true);
    expect(activeOnDay(retiredAt, "2030-03-13")).toBe(false);
  });

  it("lit le jour du retrait À PARIS : 23 h 30 UTC un 12 mars est déjà le 13", () => {
    const retiredAt = new Date("2030-03-12T23:30:00.000Z");
    expect(activeOnDay(retiredAt, "2030-03-13")).toBe(true);
    expect(activeOnDay(retiredAt, "2030-03-14")).toBe(false);
  });

  it("l'entité délègue à la même règle", () => {
    const vehicle = kangoo();
    vehicle.retire(new Date("2030-03-12T15:00:00.000Z"));
    expect(vehicle.activeOn("2030-03-12")).toBe(true);
    expect(vehicle.activeOn("2030-03-13")).toBe(false);
  });
});

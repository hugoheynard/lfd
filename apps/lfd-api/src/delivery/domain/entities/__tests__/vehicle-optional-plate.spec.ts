import { InvalidLicensePlateError, InvalidVehicleNameError } from "../../errors/delivery-errors.js";
import { Vehicle } from "../vehicle.js";

const CREATED = new Date(0);
const LATER = new Date(60_000);

/** La plaque est facultative depuis le 2026-10-14 : seul le nom est obligatoire. */
describe("Vehicle — la plaque facultative", () => {
  it("entre dans la flotte avec son seul nom", () => {
    const vehicle = Vehicle.register({ id: "v_1", name: "Fourgon neuf", at: CREATED });

    expect(vehicle.plate).toBeNull();
    expect(vehicle.toState().plate).toBeNull();
    expect(vehicle.identity.plate).toBeNull();
  });

  it.each([null, "", "   "])("lit %p comme une plaque absente", (plate) => {
    expect(Vehicle.register({ id: "v_1", name: "Kangoo", plate, at: CREATED }).plate).toBeNull();
  });

  it("refuse toujours une plaque SAISIE mal formée", () => {
    expect(() => Vehicle.register({ id: "v_1", name: "Kangoo", plate: "??", at: CREATED })).toThrow(
      InvalidLicensePlateError,
    );
  });

  it("refuse toujours un véhicule sans nom", () => {
    expect(() => Vehicle.register({ id: "v_1", name: "  ", at: CREATED })).toThrow(
      InvalidVehicleNameError,
    );
  });

  it("une correction pose la plaque, une autre l'efface", () => {
    const vehicle = Vehicle.register({ id: "v_1", name: "Kangoo", at: CREATED });

    vehicle.correct({ name: "Kangoo", plate: "ab 123 cd" }, LATER);
    expect(vehicle.plate?.value).toBe("AB-123-CD");

    vehicle.correct({ name: "Kangoo" }, LATER);
    expect(vehicle.plate).toBeNull();
  });

  it("se réhydrate sans plaque", () => {
    const state = Vehicle.register({ id: "v_1", name: "Kangoo", at: CREATED }).toState();

    expect(Vehicle.restore(state).toState()).toEqual(state);
  });
});

import {
  InvalidLicensePlateError,
  InvalidCargoDimensionsError,
  InvalidRefrigerationError,
  InvalidVehicleEnergyError,
  InvalidVehicleNameError,
  RefrigeratedVolumeExceedsCargoError,
  VehicleAlreadyRetiredError,
  VehicleNotRetiredError,
} from "../../errors/delivery-errors.js";
import {
  InvalidWheelArchesError,
  WheelArchesWithoutCargoError,
} from "../../errors/delivery-floor-errors.js";
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
      cargo: null,
      wheelArches: null,
      refrigeration: null,
      energy: null,
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

describe("Vehicle — le chargement (lot 2 bis)", () => {
  const CARGO = { lengthCm: 200, widthCm: 150, heightCm: 100 }; // 3 000 L
  const COLD = { volumeLiters: 400, minTempC: 0, maxTempC: 4 };
  const base = { id: "v_1", name: "Master", plate: "AB-123-CD", at: CREATED };

  it("porte ses dimensions et sa caisse réfrigérée, et le volume utile s'en dérive", () => {
    const vehicle = Vehicle.register({ ...base, cargo: CARGO, refrigeration: COLD });
    expect(vehicle.cargo?.volumeLiters).toBe(3000);
    expect(vehicle.toState()).toMatchObject({ cargo: CARGO, refrigeration: COLD });
    expect(Vehicle.restore(vehicle.toState()).toState()).toEqual(vehicle.toState());
  });

  it("un volume réfrigéré égal au volume utile passe ; au-dessus, refusé en nommant les deux", () => {
    expect(() =>
      Vehicle.register({ ...base, cargo: CARGO, refrigeration: { ...COLD, volumeLiters: 3000 } }),
    ).not.toThrow();
    const over = () =>
      Vehicle.register({ ...base, cargo: CARGO, refrigeration: { ...COLD, volumeLiters: 3001 } });
    expect(over).toThrow(RefrigeratedVolumeExceedsCargoError);
    expect(over).toThrow(/3001 L.*3000 L/u);
  });

  it("sans dimensions connues, le volume réfrigéré n'est borné que par lui-même", () => {
    const vehicle = Vehicle.register({ ...base, refrigeration: { ...COLD, volumeLiters: 20_000 } });
    expect(vehicle.cargo).toBeNull();
    expect(vehicle.refrigeration?.volumeLiters).toBe(20_000);
  });

  it("une correction refusée ne laisse pas la fiche à moitié corrigée", () => {
    const vehicle = Vehicle.register({ ...base, cargo: CARGO });
    expect(() =>
      vehicle.correct(
        { name: "Autre", plate: "EF-456-GH", cargo: { ...CARGO, heightCm: 0 } },
        LATER,
      ),
    ).toThrow(InvalidCargoDimensionsError);
    expect(vehicle.name).toBe("Master");
    expect(vehicle.plate.value).toBe("AB-123-CD");
    expect(vehicle.updatedAt).toEqual(CREATED);
  });

  it("absent vaut null : une correction sans chargement l'efface", () => {
    const vehicle = Vehicle.register({ ...base, cargo: CARGO, refrigeration: COLD });
    vehicle.correct({ name: "Master", plate: "AB-123-CD" }, LATER);
    expect(vehicle.toState()).toMatchObject({ cargo: null, refrigeration: null });
  });

  it("se réhydrate en revalidant le froid", () => {
    const state = { ...kangoo().toState(), refrigeration: { ...COLD, minTempC: 9, maxTempC: 4 } };
    expect(() => Vehicle.restore(state)).toThrow(InvalidRefrigerationError);
  });
});

describe("Vehicle — les passages de roue (G4)", () => {
  const CARGO = { lengthCm: 290, widthCm: 166, heightCm: 139 };
  const ARCHES = { lengthCm: 90, protrusionCm: 20, fromBackCm: 60, heightCm: 30 };
  const base = { id: "v_1", name: "Trafic", plate: "AB-123-CD", at: CREATED };

  it("les porte avec leur hauteur, et se réhydrate à l'identique", () => {
    const vehicle = Vehicle.register({ ...base, cargo: CARGO, wheelArches: ARCHES });
    expect(vehicle.wheelArches?.endCm).toBe(150);
    expect(vehicle.toState().wheelArches).toEqual(ARCHES);
    expect(vehicle.identity.wheelArches).toEqual(ARCHES);
    expect(Vehicle.restore(vehicle.toState()).toState()).toEqual(vehicle.toState());
  });

  it("refuse des passages sur un véhicule sans dimensions utiles", () => {
    expect(() => Vehicle.register({ ...base, wheelArches: ARCHES })).toThrow(
      WheelArchesWithoutCargoError,
    );
  });

  it.each([
    ["une saillie ≥ demi-largeur", { ...ARCHES, protrusionCm: 83 }, /ne laisse rien/u],
    ["un passage qui sort du plancher", { ...ARCHES, fromBackCm: 201 }, /sort d'un plancher/u],
    ["un passage qui touche le plafond", { ...ARCHES, heightCm: 139 }, /touche le plafond/u],
  ])("refuse %s, confronté au plancher", (_case, wheelArches, detail) => {
    const register = () => Vehicle.register({ ...base, cargo: CARGO, wheelArches });
    expect(register).toThrow(InvalidWheelArchesError);
    expect(register).toThrow(detail);
  });

  it("une correction qui rétrécit le plancher sous les passages est refusée, fiche intacte", () => {
    const vehicle = Vehicle.register({ ...base, cargo: CARGO, wheelArches: ARCHES });
    const narrow = { ...CARGO, widthCm: 40 };
    expect(() => vehicle.correct({ ...base, cargo: narrow, wheelArches: ARCHES }, LATER)).toThrow(
      InvalidWheelArchesError,
    );
    expect(vehicle.cargo?.widthCm).toBe(166);
    expect(vehicle.updatedAt).toEqual(CREATED);
  });

  it("absent vaut null : une correction sans passages les efface", () => {
    const vehicle = Vehicle.register({ ...base, cargo: CARGO, wheelArches: ARCHES });
    vehicle.correct({ name: "Trafic", plate: "AB-123-CD", cargo: CARGO }, LATER);
    expect(vehicle.wheelArches).toBeNull();
  });
});

describe("Vehicle — l'énergie (L2b-C6)", () => {
  const base = { id: "v_1", name: "e-Kangoo", plate: "AB-123-CD", at: CREATED };

  it("la porte, et une correction sans énergie la remet à non renseignée", () => {
    const vehicle = Vehicle.register({ ...base, energy: "electric" });
    expect(vehicle.energy).toBe("electric");
    expect(Vehicle.restore(vehicle.toState()).energy).toBe("electric");
    vehicle.correct({ name: "e-Kangoo", plate: "AB-123-CD" }, LATER);
    expect(vehicle.energy).toBeNull();
  });

  it("refuse une énergie inconnue, à la saisie comme à la réhydratation", () => {
    expect(() => Vehicle.register({ ...base, energy: "hydrogen" })).toThrow(
      InvalidVehicleEnergyError,
    );
    const state = { ...Vehicle.register(base).toState(), energy: "hydrogen" };
    expect(() => Vehicle.restore(state)).toThrow(InvalidVehicleEnergyError);
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

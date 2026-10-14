import { Vehicle } from "../../entities/vehicle.js";
import { vehicleGaps } from "../vehicle-gaps.js";

const AT = new Date(0);
const CARGO = { lengthCm: 330, widthCm: 170, heightCm: 176 };
const ARCHES = { lengthCm: 90, protrusionCm: 22, fromBackCm: 100, heightCm: 30 };

function codesOf(vehicle: Vehicle): readonly string[] {
  return vehicleGaps(vehicle).map((gap) => gap.code);
}

describe("vehicleGaps — ce qu'un véhicule ne peut pas faire tant qu'une donnée manque", () => {
  it("un nom seul : sans plaque et sans cotes, et pas encore de passages de roue à réclamer", () => {
    const bare = Vehicle.register({ id: "v_1", name: "Fourgon neuf", at: AT });

    expect(codesOf(bare)).toEqual(["no_plate", "no_cargo"]);
  });

  it("une fiche complète n'avertit de rien", () => {
    const full = Vehicle.register({
      id: "v_1",
      name: "Transit",
      plate: "AB-123-CD",
      cargo: CARGO,
      wheelArches: ARCHES,
      at: AT,
    });

    expect(vehicleGaps(full)).toEqual([]);
  });

  it("des cotes sans passages de roue : le plancher est compté comme un rectangle", () => {
    const flat = Vehicle.register({
      id: "v_1",
      name: "Transit",
      plate: "AB-123-CD",
      cargo: CARGO,
      at: AT,
    });

    expect(codesOf(flat)).toEqual(["no_wheel_arches"]);
    expect(vehicleGaps(flat)[0]?.message).toMatch(/rectangle/u);
  });

  it("chaque phrase nomme le véhicule et ce qu'il ne peut pas faire", () => {
    const [plate, cargo] = vehicleGaps(Vehicle.register({ id: "v_1", name: "Kangoo", at: AT }));

    expect(plate?.message).toMatch(/« Kangoo » n'a pas de plaque/u);
    expect(plate?.message).toMatch(/deux fois/u);
    expect(cargo?.message).toMatch(/« Kangoo » n'a pas ses cotes utiles/u);
    expect(cargo?.message).toMatch(/proposer des tournées/u);
    expect(cargo?.message).toMatch(/aucun arrêt qui a des bacs/u);
  });

  it("lit une vue comme l'agrégat : `null` = absent", () => {
    expect(
      vehicleGaps({ name: "Kangoo", plate: "AB-123-CD", cargo: null, wheelArches: null }).map(
        (gap) => gap.code,
      ),
    ).toEqual(["no_cargo"]);
  });
});

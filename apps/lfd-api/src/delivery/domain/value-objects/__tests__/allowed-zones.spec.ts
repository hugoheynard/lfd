import { InvalidVehicleZonesError } from "../../errors/delivery-zone-errors.js";
import { AllowedZones, MAX_ALLOWED_ZONES } from "../allowed-zones.js";

describe("AllowedZones", () => {
  it("vide : partout, y compris une commande de n'importe quelle zone", () => {
    const zones = AllowedZones.of([]);
    expect(zones.everywhere).toBe(true);
    expect(zones.allows("z_nord")).toBe(true);
    expect(zones.allows(null)).toBe(true);
  });

  it("restreint : seulement ses zones, et une commande sans zone passe partout", () => {
    const zones = AllowedZones.of(["z_nord"]);
    expect(zones.everywhere).toBe(false);
    expect(zones.allows("z_nord")).toBe(true);
    expect(zones.allows("z_sud")).toBe(false);
    expect(zones.allows(null)).toBe(true);
  });

  it("une seule forme : rognées, dédoublonnées, triées", () => {
    expect(AllowedZones.of([" z_sud", "z_nord", "z_sud "]).values).toEqual(["z_nord", "z_sud"]);
  });

  it("refuse un identifiant vide, et plus de zones qu'une fiche n'en porte", () => {
    expect(() => AllowedZones.of(["z_nord", "  "])).toThrow(InvalidVehicleZonesError);
    const many = Array.from({ length: MAX_ALLOWED_ZONES + 1 }, (_, index) => `z_${String(index)}`);
    expect(() => AllowedZones.of(many)).toThrow(InvalidVehicleZonesError);
  });
});

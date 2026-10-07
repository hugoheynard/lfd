import {
  DriverWithoutAccessError,
  DriverWithoutDoorstepError,
} from "../../errors/delivery-driver-errors.js";
import { DriverAccess } from "../driver-access.js";

/** Paul tient les deux droits, Marc ne fait que conduire, Zoé n'a que la porte. */
const ACCESS = DriverAccess.of(["staff_paul", "staff_marc"], ["staff_paul", "staff_zoe"]);

describe("DriverAccess — qui peut être livreur (MT-D2 v2 ; audit 2026-10-07, B8)", () => {
  it("peut livrer qui tient les deux droits, et lui seul", () => {
    expect(ACCESS.canDeliver("staff_paul")).toBe(true);
    expect(ACCESS.canDeliver("staff_marc")).toBe(false);
    expect(ACCESS.canDeliver("staff_zoe")).toBe(false);
    expect(ACCESS.canDeliver("staff_inconnu")).toBe(false);
  });

  it("laisse passer qui tient les deux droits", () => {
    expect(() => ACCESS.ensureCanDeliver("staff_paul", "Kangoo blanc")).not.toThrow();
  });

  /**
   * Régression (audit 2026-10-07, B8) : seul le droit de conduire était lu.
   * Qui ne faisait que conduire était affecté, partait, puis prenait 403 à
   * chaque geste à la porte sans pouvoir terminer sa tournée.
   */
  it("🔴 refuse qui conduit sans les gestes à la porte, en nommant le droit qui manque", () => {
    expect(() => ACCESS.ensureCanDeliver("staff_marc", "Kangoo blanc")).toThrow(
      DriverWithoutDoorstepError,
    );
    expect(() => ACCESS.ensureCanDeliver("staff_marc", "Kangoo blanc")).toThrow(
      /« Kangoo blanc ».*Accordez « Gestes à la porte » à son rôle dans Admin › Rôles/u,
    );
  });

  it("refuse d'abord le droit de conduire : sans lui, les gestes à la porte ne font pas un livreur", () => {
    expect(() => ACCESS.ensureCanDeliver("staff_zoe", "Kangoo blanc")).toThrow(
      DriverWithoutAccessError,
    );
    expect(() => ACCESS.ensureCanDeliver("staff_inconnu", "Kangoo blanc")).toThrow(
      DriverWithoutAccessError,
    );
  });

  it("nomme le refus par son code, pour l'écran qui le relaie", () => {
    expect(new DriverWithoutDoorstepError("Kangoo blanc").code).toBe(
      "delivery.driver_without_doorstep",
    );
  });
});

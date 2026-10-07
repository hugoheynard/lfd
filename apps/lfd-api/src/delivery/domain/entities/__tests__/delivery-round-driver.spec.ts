import { DeliveryRoundDepartedError } from "../../errors/delivery-loading-errors.js";
import {
  DriverWithoutAccessError,
  DriverWithoutDoorstepError,
} from "../../errors/delivery-driver-errors.js";
import { DriverAccess } from "../../value-objects/driver-access.js";
import { DeliveryRound } from "../delivery-round.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const LATER = new Date(60_000);
/** Paul et Léa tiennent les deux droits ; Marc conduit sans les gestes à la porte. */
const DRIVERS = DriverAccess.of(
  ["staff_paul", "staff_lea", "staff_marc"],
  ["staff_paul", "staff_lea"],
);

function round(
  overrides: { departedAt?: Date | null; driverStaffId?: string | null } = {},
): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: DAY,
    vehicleId: "v_1",
    vehicleName: "Kangoo blanc",
    passage: 1,
    version: 3,
    departedAt: overrides.departedAt ?? null,
    driverStaffId: overrides.driverStaffId ?? null,
    createdAt: AT,
    updatedAt: AT,
    stops: [{ id: "s_1", orderId: "o_1", position: 1, closedAt: null }],
  });
}

describe("DeliveryRound — le livreur (plan « Ma tournée », MT-D2 v2)", () => {
  it("une tournée ouverte n'a pas de livreur", () => {
    expect(round().driverStaffId).toBeNull();
  });

  it("affecte un livreur qui tient le droit : écrit, version avancée, relu par le snapshot", () => {
    const subject = round();

    expect(subject.assignDriver("staff_paul", DRIVERS, LATER)).toBe(true);

    expect(subject.driverStaffId).toBe("staff_paul");
    expect(subject.version).toBe(4);
    expect(subject.toSnapshot()).toMatchObject({ driverStaffId: "staff_paul", updatedAt: LATER });
    expect(DeliveryRound.restore(subject.toSnapshot()).driverStaffId).toBe("staff_paul");
  });

  it("remplace un livreur par un autre", () => {
    const subject = round({ driverStaffId: "staff_paul" });

    subject.assignDriver("staff_lea", DRIVERS, LATER);

    expect(subject.driverStaffId).toBe("staff_lea");
  });

  it("réaffecter le même livreur ne change rien : ni écriture, ni version", () => {
    const subject = round({ driverStaffId: "staff_paul" });

    expect(subject.assignDriver("staff_paul", DRIVERS, LATER)).toBe(false);
    expect(subject.version).toBe(3);
  });

  it("refuse une personne qui n'a pas le droit effectif de conduire, en le disant", () => {
    const subject = round();

    expect(() => subject.assignDriver("staff_comptoir", DRIVERS, LATER)).toThrow(
      DriverWithoutAccessError,
    );
    expect(() => subject.assignDriver("staff_comptoir", DRIVERS, LATER)).toThrow(
      /Conduire sa tournée/u,
    );
    expect(subject.driverStaffId).toBeNull();
    expect(subject.version).toBe(3);
  });

  /**
   * Régression (audit 2026-10-07, B8) : l'agrégat ne demandait que le droit de
   * conduire. Marc était affecté, partait, puis prenait 403 à chaque geste à la
   * porte sans pouvoir terminer sa tournée.
   */
  it("🔴 refuse un conducteur sans les gestes à la porte, en nommant le droit qui manque", () => {
    const subject = round();

    expect(() => subject.assignDriver("staff_marc", DRIVERS, LATER)).toThrow(
      DriverWithoutDoorstepError,
    );
    expect(() => subject.assignDriver("staff_marc", DRIVERS, LATER)).toThrow(
      /mais pas « Gestes à la porte » : affectée à « Kangoo blanc »/u,
    );
    expect(subject.driverStaffId).toBeNull();
    expect(subject.version).toBe(3);
  });

  it("refuse de réaffecter le même livreur s'il a perdu les gestes à la porte", () => {
    const subject = round({ driverStaffId: "staff_marc" });

    expect(() => subject.assignDriver("staff_marc", DRIVERS, LATER)).toThrow(
      DriverWithoutDoorstepError,
    );
    expect(subject.version).toBe(3);
  });

  it("refuse d'affecter une tournée partie (I6), même un livreur qui tient le droit", () => {
    const subject = round({ departedAt: AT });

    expect(() => subject.assignDriver("staff_paul", DRIVERS, LATER)).toThrow(
      DeliveryRoundDepartedError,
    );
    expect(subject.driverStaffId).toBeNull();
  });

  it("retire le livreur et rend celui qui l'était — même s'il a perdu le droit", () => {
    const subject = round({ driverStaffId: "staff_ancien" });

    expect(subject.unassignDriver(LATER)).toBe("staff_ancien");

    expect(subject.driverStaffId).toBeNull();
    expect(subject.version).toBe(4);
  });

  it("retirer sans livreur ne change rien", () => {
    const subject = round();

    expect(subject.unassignDriver(LATER)).toBeNull();
    expect(subject.version).toBe(3);
  });

  it("refuse de retirer le livreur d'une tournée partie", () => {
    const subject = round({ departedAt: AT, driverStaffId: "staff_paul" });

    expect(() => subject.unassignDriver(LATER)).toThrow(DeliveryRoundDepartedError);
    expect(subject.driverStaffId).toBe("staff_paul");
  });

  it("partir garde le livreur affecté", () => {
    const subject = round({ driverStaffId: "staff_paul" });

    subject.depart(LATER, [{ stopId: "s_1", reference: "C-1", state: "loaded", binsToRedo: [] }]);

    expect(subject.toSnapshot()).toMatchObject({ driverStaffId: "staff_paul", departedAt: LATER });
  });
});

import { DeliveryIncident, type IncidentReport, incidentPhotoKey } from "../delivery-incident.js";
import {
  DeliveryRoundReturnedError,
  DoorstepIncidentWithoutStopError,
  DoorstepRoundNotDepartedError,
  DoorstepStopNotFoundError,
  IncidentNoteTooLongError,
  InvalidIncidentReasonError,
} from "../../errors/delivery-doorstep-errors.js";

// Un instant recopié tel quel, jamais comparé à l'horloge.
const AT = new Date(5_000);

function report(overrides: Partial<IncidentReport> = {}): IncidentReport {
  return {
    id: "inc_1",
    round: {
      id: "r_1",
      serviceDay: "2030-03-12",
      departed: true,
      returned: false,
      stopIds: new Set(["s_1", "s_2"]),
    },
    stopId: "s_1",
    family: "doorstep",
    reason: "nobody_present",
    note: "  sonné trois fois  ",
    photoKey: null,
    at: AT,
    author: { staffUserId: "staff_paul", name: "Paul Roux" },
    ...overrides,
  };
}

describe("DeliveryIncident.report — un problème signalé (§ 3)", () => {
  it("naît daté, sur sa tournée et son jour, la note nettoyée", () => {
    const incident = DeliveryIncident.report(report());

    expect(incident.toSnapshot()).toEqual({
      id: "inc_1",
      roundId: "r_1",
      stopId: "s_1",
      serviceDay: "2030-03-12",
      family: "doorstep",
      reason: "nobody_present",
      note: "sonné trois fois",
      photoKey: null,
      reportedAt: AT,
      reportedBy: "staff_paul",
      reportedByName: "Paul Roux",
    });
    expect(incident.hasPhoto).toBe(false);
  });

  it("un problème technique ou routier porte sur la tournée seule", () => {
    const incident = DeliveryIncident.report(
      report({ family: "road", reason: "road_closed", stopId: null }),
    );

    expect(incident.stopId).toBeNull();
  });

  it("refuse un problème à la remise sans arrêt", () => {
    expect(() => DeliveryIncident.report(report({ stopId: null }))).toThrow(
      DoorstepIncidentWithoutStopError,
    );
  });

  it("refuse un motif d'une autre famille", () => {
    expect(() =>
      DeliveryIncident.report(report({ family: "technical", reason: "nobody_present" })),
    ).toThrow(InvalidIncidentReasonError);
  });

  it("refuse un arrêt qui n'est pas de cette tournée", () => {
    expect(() => DeliveryIncident.report(report({ stopId: "s_9" }))).toThrow(
      DoorstepStopNotFoundError,
    );
  });

  it("refuse une tournée encore au dépôt", () => {
    const round = {
      id: "r_1",
      serviceDay: "2030-03-12",
      departed: false,
      returned: false,
      stopIds: new Set(["s_1"]),
    };
    expect(() => DeliveryIncident.report(report({ round }))).toThrow(DoorstepRoundNotDepartedError);
  });

  it("refuse une tournée rentrée (PL2) : plus aucun signalement", () => {
    const round = {
      id: "r_1",
      serviceDay: "2030-03-12",
      departed: true,
      returned: true,
      stopIds: new Set(["s_1"]),
    };
    expect(() => DeliveryIncident.report(report({ round }))).toThrow(DeliveryRoundReturnedError);
  });

  it("borne la note à 500 caractères — 500 passent, 501 non", () => {
    expect(() => DeliveryIncident.report(report({ note: "x".repeat(500) }))).not.toThrow();
    expect(() => DeliveryIncident.report(report({ note: "x".repeat(501) }))).toThrow(
      IncidentNoteTooLongError,
    );
  });

  it("compose la clé de la photo depuis la tournée et le signalement, jamais depuis le client", () => {
    expect(incidentPhotoKey("r_1", "inc_1")).toBe("delivery/incidents/r_1/inc_1");
    const incident = DeliveryIncident.report(
      report({ photoKey: incidentPhotoKey("r_1", "inc_1") }),
    );
    expect(incident.hasPhoto).toBe(true);
  });
});

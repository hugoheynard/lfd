import type { DeliverySimulationPayload } from "@lfd/contracts";

import {
  InvalidSimulationScenarioNameError,
  SimulationScenarioAlreadyArchivedError,
  SimulationScenarioUnreadableError,
} from "../../errors/delivery-simulation-errors.js";
import { SimulationScenario } from "../simulation-scenario.js";

const AT = new Date(0);
const LATER = new Date(60_000);
const HUGO = { staffUserId: "staff_1", name: "Hugo H", role: "admin" };
const ANNE = { staffUserId: "staff_2", name: "Anne B", role: "manager" };

const SCENARIO: DeliverySimulationPayload = {
  stops: [{ id: "a", label: "Chez A", gps: { lat: 45.6, lng: 5.9 }, window: null }],
  vehicles: ["Kangoo"],
  settings: {
    earliestDeparture: "06:00",
    maxRoundMinutes: 240,
    stopMinutes: 5,
    defaultMode: "new_rounds",
    multiplePassages: true,
  },
  departure: null,
};

const recorded = (name = "Mardi chargé") =>
  SimulationScenario.record({ id: "sc_1", name, scenario: SCENARIO, at: AT, author: HUGO });

describe("SimulationScenario — un scénario enregistré (L9-C7)", () => {
  it("s'enregistre sous un nom rogné, avec son auteur", () => {
    const state = recorded("  Mardi chargé  ").toState();

    expect(state.name).toBe("Mardi chargé");
    expect(state.createdByStaffId).toBe("staff_1");
    expect(state.updatedBy).toEqual(HUGO);
    expect(state.archivedAt).toBeNull();
  });

  it.each(["", "   ", "x".repeat(81)])("refuse le nom %j", (name) => {
    expect(() => recorded(name)).toThrow(InvalidSimulationScenarioNameError);
  });

  it("se remplace : nom, contenu et dernier auteur", () => {
    const scenario = recorded();
    const other = { ...SCENARIO, vehicles: ["Kangoo", "Trafic"] };

    scenario.replace("Mercredi", other, LATER, ANNE);

    expect(scenario.name).toBe("Mercredi");
    expect(scenario.scenario()).toEqual(other);
    expect(scenario.toState()).toMatchObject({ updatedAt: LATER, updatedBy: ANNE, createdAt: AT });
  });

  it("s'archive une fois, puis ne se remplace ni ne se duplique plus", () => {
    const scenario = recorded();
    scenario.archive(LATER, ANNE);

    expect(scenario.archived).toBe(true);
    expect(() => scenario.archive(LATER, ANNE)).toThrow(SimulationScenarioAlreadyArchivedError);
    expect(() => scenario.replace("X", SCENARIO, LATER, ANNE)).toThrow(
      SimulationScenarioAlreadyArchivedError,
    );
    expect(() => scenario.duplicate({ id: "sc_2", name: "Y", at: LATER, author: ANNE })).toThrow(
      SimulationScenarioAlreadyArchivedError,
    );
  });

  it("se duplique en un scénario neuf, au même contenu, par son nouvel auteur", () => {
    const copy = recorded().duplicate({ id: "sc_2", name: "Copie", at: LATER, author: ANNE });

    expect(copy.toState()).toMatchObject({
      id: "sc_2",
      name: "Copie",
      createdByStaffId: "staff_2",
      createdAt: LATER,
    });
    expect(copy.scenario()).toEqual(SCENARIO);
  });

  describe("un contenu qui ne se relit plus", () => {
    const unreadable = () =>
      SimulationScenario.restore({
        ...recorded().toState(),
        content: { readable: false, reason: "stops : au moins un arrêt" },
      });

    it("se refuse en le nommant, avec la raison", () => {
      expect(() => unreadable().scenario()).toThrow(SimulationScenarioUnreadableError);
      expect(() => unreadable().scenario()).toThrow(/Mardi chargé.*au moins un arrêt/u);
    });

    it("ne se duplique pas", () => {
      expect(() =>
        unreadable().duplicate({ id: "sc_2", name: "Y", at: LATER, author: ANNE }),
      ).toThrow(SimulationScenarioUnreadableError);
    });

    it("s'archive quand même — c'est la sortie que son refus propose", () => {
      const scenario = unreadable();
      scenario.archive(LATER, ANNE);

      expect(scenario.archived).toBe(true);
    });

    it("se répare en le remplaçant", () => {
      const scenario = unreadable();
      scenario.replace("Mardi chargé", SCENARIO, LATER, ANNE);

      expect(scenario.scenario()).toEqual(SCENARIO);
    });
  });
});

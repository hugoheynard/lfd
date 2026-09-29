import type {
  DeliverySimulationPayload,
  DeliverySimulationScenarioSummaryView,
} from "@lfd/contracts";

import {
  SimulationScenario,
  type SimulationScenarioContent,
} from "../../../domain/entities/simulation-scenario.js";
import {
  SimulationScenarioReader,
  type SimulationScenarioRecord,
} from "../../../domain/ports/simulation-scenario.reader.js";
import { SimulationScenarioRepository } from "../../../domain/ports/simulation-scenario.repository.js";

/**
 * Les scénarios en mémoire, stockés par leur état comme en base. `reader`
 * lit la même source que l'écriture — ce que fait l'adaptateur Prisma.
 */
export class InMemorySimulationScenarios extends SimulationScenarioRepository {
  readonly saved: SimulationScenario[] = [];
  readonly reader: SimulationScenarioReader;
  private readonly byId = new Map<string, SimulationScenario>();

  constructor(...scenarios: readonly SimulationScenario[]) {
    super();
    for (const scenario of scenarios) {
      this.byId.set(scenario.id, SimulationScenario.restore(scenario.toState()));
    }
    const live = (): SimulationScenario[] => [...this.byId.values()].filter((s) => !s.archived);
    this.reader = new (class extends SimulationScenarioReader {
      list(): Promise<readonly DeliverySimulationScenarioSummaryView[]> {
        return Promise.resolve(
          live()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((scenario) => summaryOf(scenario)),
        );
      }

      byId(id: string): Promise<SimulationScenarioRecord | null> {
        const found = live().find((scenario) => scenario.id === id);
        if (found === undefined) {
          return Promise.resolve(null);
        }
        const state = found.toState();
        return Promise.resolve({
          id: state.id,
          name: state.name,
          content: state.content,
          updatedAt: state.updatedAt,
        });
      }
    })();
  }

  load(id: string): Promise<SimulationScenario | null> {
    const found = this.byId.get(id);
    return Promise.resolve(
      found === undefined ? null : SimulationScenario.restore(found.toState()),
    );
  }

  save(scenario: SimulationScenario): Promise<void> {
    this.saved.push(scenario);
    this.byId.set(scenario.id, SimulationScenario.restore(scenario.toState()));
    return Promise.resolve();
  }

  nameTaken(name: string, exceptId: string | null): Promise<boolean> {
    return Promise.resolve(
      [...this.byId.values()].some((s) => !s.archived && s.name === name && s.id !== exceptId),
    );
  }
}

function summaryOf(scenario: SimulationScenario): DeliverySimulationScenarioSummaryView {
  const { content, updatedAt, updatedBy } = scenario.toState();
  return {
    id: scenario.id,
    name: scenario.name,
    stops: content.readable ? content.payload.stops.length : 0,
    vehicles: content.readable ? content.payload.vehicles.length : 0,
    updatedAt: updatedAt.toISOString(),
    updatedBy: updatedBy.name === "" ? null : updatedBy.name,
  };
}

export const SIMULATION_AUTHOR = { staffUserId: "staff_1", name: "Hugo H", role: "admin" };

export const SIMULATION: DeliverySimulationPayload = {
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

/** Un scénario enregistré, lisible ou non. */
export function scenarioNamed(
  id: string,
  name: string,
  content: SimulationScenarioContent = { readable: true, payload: SIMULATION },
): SimulationScenario {
  const recorded = SimulationScenario.record({
    id,
    name,
    scenario: SIMULATION,
    at: new Date(0),
    author: SIMULATION_AUTHOR,
  });
  return SimulationScenario.restore({ ...recorded.toState(), content });
}

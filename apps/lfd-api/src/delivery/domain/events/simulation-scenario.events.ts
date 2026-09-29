import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { SimulationScenario } from "../entities/simulation-scenario.js";

/**
 * **Les faits des scénarios du simulateur** (L9-C7). Le préfixe est rangé sous
 * `commandes` dans `activity-module.ts`, comme le reste de la livraison.
 * L'acteur n'est pas ici : l'adaptateur du journal le lit dans le contexte.
 */
export const SIMULATION_SCENARIO_FACTS = {
  created: "delivery_simulation_scenario.created",
  replaced: "delivery_simulation_scenario.replaced",
  duplicated: "delivery_simulation_scenario.duplicated",
  archived: "delivery_simulation_scenario.archived",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "delivery_simulation_scenario";

function factOf(
  type: JournalFactType,
  scenario: SimulationScenario,
  payload: Readonly<Record<string, unknown>>,
): JournalFact {
  return {
    type,
    subjectType: SUBJECT_TYPE,
    subjectId: scenario.id,
    payload: { subjectLabel: scenario.name, ...payload },
  };
}

/** Le nombre d'arrêts et de véhicules : de quoi reconnaître l'essai. */
function sizeOf(scenario: SimulationScenario): {
  readonly stops: number;
  readonly vehicles: number;
} {
  const payload = scenario.scenario();
  return { stops: payload.stops.length, vehicles: payload.vehicles.length };
}

export class SimulationScenarioCreatedEvent implements JournaledEvent {
  constructor(readonly scenario: SimulationScenario) {}

  journalFact(): JournalFact {
    return factOf(SIMULATION_SCENARIO_FACTS.created, this.scenario, sizeOf(this.scenario));
  }
}

export class SimulationScenarioReplacedEvent implements JournaledEvent {
  constructor(
    readonly scenario: SimulationScenario,
    readonly previousName: string,
  ) {}

  journalFact(): JournalFact {
    const renamedFrom = this.previousName === this.scenario.name ? null : this.previousName;
    return factOf(SIMULATION_SCENARIO_FACTS.replaced, this.scenario, {
      renamedFrom,
      ...sizeOf(this.scenario),
    });
  }
}

export class SimulationScenarioDuplicatedEvent implements JournaledEvent {
  constructor(
    readonly copy: SimulationScenario,
    readonly source: SimulationScenario,
  ) {}

  journalFact(): JournalFact {
    return factOf(SIMULATION_SCENARIO_FACTS.duplicated, this.copy, {
      source: { id: this.source.id, name: this.source.name },
    });
  }
}

export class SimulationScenarioArchivedEvent implements JournaledEvent {
  constructor(readonly scenario: SimulationScenario) {}

  journalFact(): JournalFact {
    return factOf(SIMULATION_SCENARIO_FACTS.archived, this.scenario, {});
  }
}

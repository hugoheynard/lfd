import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { PurchaseScenario } from "../entities/purchase-scenario.js";

/**
 * **Les faits des scénarios d'achat** (B-D5, lot B3). Le préfixe est rangé
 * sous `commandes` dans `activity-module.ts`, comme la bibliothèque d'achat.
 * L'acteur n'est pas ici : l'adaptateur du journal le lit dans le contexte.
 */
export const PURCHASE_SCENARIO_FACTS = {
  created: "delivery_purchase_scenario.created",
  replaced: "delivery_purchase_scenario.replaced",
  archived: "delivery_purchase_scenario.archived",
  reactivated: "delivery_purchase_scenario.reactivated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "delivery_purchase_scenario";

function factOf(
  type: JournalFactType,
  scenario: PurchaseScenario,
  payload: Readonly<Record<string, unknown>>,
): JournalFact {
  return {
    type,
    subjectType: SUBJECT_TYPE,
    subjectId: scenario.id,
    payload: { subjectLabel: scenario.name, ...payload },
  };
}

/** Le nombre de véhicules et de formats : de quoi reconnaître l'essai. */
function sizeOf(scenario: PurchaseScenario): {
  readonly vehicles: number;
  readonly formats: number;
} {
  const { selection } = scenario.content();
  return { vehicles: selection.vehicles.length, formats: selection.formats.length };
}

export class PurchaseScenarioCreatedEvent implements JournaledEvent {
  constructor(readonly scenario: PurchaseScenario) {}

  journalFact(): JournalFact {
    return factOf(PURCHASE_SCENARIO_FACTS.created, this.scenario, sizeOf(this.scenario));
  }
}

export class PurchaseScenarioReplacedEvent implements JournaledEvent {
  constructor(
    readonly scenario: PurchaseScenario,
    readonly previousName: string,
  ) {}

  journalFact(): JournalFact {
    const renamedFrom = this.previousName === this.scenario.name ? null : this.previousName;
    return factOf(PURCHASE_SCENARIO_FACTS.replaced, this.scenario, {
      renamedFrom,
      ...sizeOf(this.scenario),
    });
  }
}

export class PurchaseScenarioArchivedEvent implements JournaledEvent {
  constructor(readonly scenario: PurchaseScenario) {}

  journalFact(): JournalFact {
    return factOf(PURCHASE_SCENARIO_FACTS.archived, this.scenario, {});
  }
}

export class PurchaseScenarioReactivatedEvent implements JournaledEvent {
  constructor(readonly scenario: PurchaseScenario) {}

  journalFact(): JournalFact {
    return factOf(PURCHASE_SCENARIO_FACTS.reactivated, this.scenario, {});
  }
}

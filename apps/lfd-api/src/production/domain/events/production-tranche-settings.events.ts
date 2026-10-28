import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { ProductionTrancheSettingsState } from "../entities/production-tranche-settings.js";

/**
 * **Le fait des tranches de production** (Réglages › Production, plan
 * `fournil/plan-tranches-de-production.md`, T1). La ligne du réglage ne
 * garde que le dernier état ; le journal est la seule mémoire des repères
 * qu'a eus l'atelier, et de qui les a changés.
 */
export const PRODUCTION_TRANCHE_SETTINGS_FACTS = {
  updated: "production_tranche_settings.updated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet du fait : il n'y a qu'un réglage. */
export const PRODUCTION_TRANCHE_SETTINGS_SUBJECT = "house";

/** La charge dit l'état posé ET l'état remplacé, défauts compris. */
export class ProductionTrancheSettingsUpdatedEvent implements JournaledEvent {
  constructor(
    readonly next: ProductionTrancheSettingsState,
    readonly previous: ProductionTrancheSettingsState,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PRODUCTION_TRANCHE_SETTINGS_FACTS.updated,
      subjectType: "production_tranche_settings",
      subjectId: PRODUCTION_TRANCHE_SETTINGS_SUBJECT,
      payload: {
        mode: this.next.mode,
        fixedTranches: [...this.next.fixedTranches],
        previous: {
          mode: this.previous.mode,
          fixedTranches: [...this.previous.fixedTranches],
        },
      },
    };
  }
}

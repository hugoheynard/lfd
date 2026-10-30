import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { ProductionDisplaySettingsState } from "../entities/production-display-settings.js";

/**
 * **Le fait du rangement du fournil** (Réglages › Production, 2026-10-30). La
 * ligne ne garde que le dernier état ; le journal est la seule mémoire de qui
 * a changé la façon dont le fournil lit ses fiches.
 */
export const PRODUCTION_DISPLAY_SETTINGS_FACTS = {
  updated: "production_display_settings.updated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet du fait : il n'y a qu'un réglage. */
export const PRODUCTION_DISPLAY_SETTINGS_SUBJECT = "house";

/** La charge dit l'état posé ET l'état remplacé, défaut compris. */
export class ProductionDisplaySettingsUpdatedEvent implements JournaledEvent {
  constructor(
    readonly next: ProductionDisplaySettingsState,
    readonly previous: ProductionDisplaySettingsState,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PRODUCTION_DISPLAY_SETTINGS_FACTS.updated,
      subjectType: "production_display_settings",
      subjectId: PRODUCTION_DISPLAY_SETTINGS_SUBJECT,
      payload: {
        showSubcategories: this.next.showSubcategories,
        previous: { showSubcategories: this.previous.showSubcategories },
      },
    };
  }
}

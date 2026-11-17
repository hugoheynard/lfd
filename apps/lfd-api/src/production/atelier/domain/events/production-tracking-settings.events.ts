import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { ProductionTrackingSettingsState } from "../entities/production-tracking-settings.js";

/**
 * **Le fait du niveau de suivi du fournil** (
 * `documentation/fournil/les-niveaux-de-suivi.md`). La ligne ne
 * garde que le dernier état ; le journal est la seule mémoire de qui a
 * changé la façon dont le fournil suit ses lignes.
 */
export const PRODUCTION_TRACKING_SETTINGS_FACTS = {
  updated: "production_tracking_settings.updated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet du fait : il n'y a qu'un réglage. */
export const PRODUCTION_TRACKING_SETTINGS_SUBJECT = "house";

/** La charge dit l'état posé ET l'état remplacé, défaut compris. */
export class ProductionTrackingSettingsUpdatedEvent implements JournaledEvent {
  constructor(
    readonly next: ProductionTrackingSettingsState,
    readonly previous: ProductionTrackingSettingsState,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PRODUCTION_TRACKING_SETTINGS_FACTS.updated,
      subjectType: "production_tracking_settings",
      subjectId: PRODUCTION_TRACKING_SETTINGS_SUBJECT,
      payload: {
        level: this.next.level,
        marginMinutes: this.next.marginMinutes,
        previous: { level: this.previous.level, marginMinutes: this.previous.marginMinutes },
      },
    };
  }
}

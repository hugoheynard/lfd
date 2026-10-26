import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { QualityControlSettingsState } from "../entities/quality-control-settings.js";

/**
 * **Le fait des réglages du contrôle qualité** (Réglages › Commandes, décision
 * de Hugo, 2026-10-26). La ligne du réglage ne garde que le dernier état et son
 * auteur ; le journal est la seule mémoire de qui a coupé le contrôle, et quand.
 */
export const QUALITY_CONTROL_SETTINGS_FACTS = {
  updated: "production_quality_settings.updated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet du fait : il n'y a qu'un réglage. */
export const QUALITY_CONTROL_SETTINGS_SUBJECT = "quality";

/** La charge dit l'état posé ET l'état remplacé, défauts compris. */
export class QualityControlSettingsUpdatedEvent implements JournaledEvent {
  constructor(
    readonly next: QualityControlSettingsState,
    readonly previous: QualityControlSettingsState,
  ) {}

  journalFact(): JournalFact {
    return {
      type: QUALITY_CONTROL_SETTINGS_FACTS.updated,
      subjectType: "production_quality_settings",
      subjectId: QUALITY_CONTROL_SETTINGS_SUBJECT,
      payload: {
        lineChecks: this.next.lineChecks,
        orderChecks: this.next.orderChecks,
        previous: {
          lineChecks: this.previous.lineChecks,
          orderChecks: this.previous.orderChecks,
        },
      },
    };
  }
}

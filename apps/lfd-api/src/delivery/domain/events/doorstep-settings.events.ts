import type { DoorstepRule } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/** Le fait du réglage global à la porte ; préfixe rangé sous `commandes` (`activity-module.ts`). */
export const DOORSTEP_SETTINGS_FACT: JournalFactType = "delivery_doorstep.settings_updated";

/** Le sujet du réglage : il n'y en a qu'un. */
export const DOORSTEP_SETTINGS_SUBJECT = "doorstep";
const DOORSTEP_SETTINGS_LABEL = "Décision à la porte";

/**
 * **La décision réglée d'avance à la porte a changé** — le réglage GLOBAL
 * (`plan-a-la-porte.md`, B3 bis, LB-Q6). `before` est `null` quand personne
 * n'avait réglé : c'était « Me demander », par défaut, et le dire autrement
 * ferait croire qu'on l'avait choisi.
 */
export class DoorstepSettingsUpdatedEvent implements JournaledEvent {
  constructor(
    readonly rule: DoorstepRule,
    readonly before: DoorstepRule | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DOORSTEP_SETTINGS_FACT,
      subjectType: "delivery_doorstep",
      subjectId: DOORSTEP_SETTINGS_SUBJECT,
      payload: { subjectLabel: DOORSTEP_SETTINGS_LABEL, before: this.before, after: this.rule },
    };
  }
}

import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Les faits des réglages du fournil** (plan
 * `documentation/fournil/arret-du-plan.md`, lot A1).
 *
 * La ligne du réglage ne garde que le dernier état et son auteur ; le journal
 * est la seule mémoire de qui a changé quoi.
 */
export const PRODUCTION_SETTINGS_FACT_TYPES = {
  closedDayAdded: "production_closed_day.added",
  closedDayRemoved: "production_closed_day.removed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const CLOSED_DAY_SUBJECT = "production_closed_day";

/** Fait : **un jour fermé est posé**. Le libellé est la date : un jour n'a pas d'autre nom. */
export class ProductionClosedDayAddedEvent implements JournaledEvent {
  constructor(readonly serviceDay: string) {}

  journalFact(): JournalFact {
    return closedDayFact(PRODUCTION_SETTINGS_FACT_TYPES.closedDayAdded, this.serviceDay);
  }
}

/** Fait : **un jour fermé est retiré** — il redevient un jour de production. */
export class ProductionClosedDayRemovedEvent implements JournaledEvent {
  constructor(readonly serviceDay: string) {}

  journalFact(): JournalFact {
    return closedDayFact(PRODUCTION_SETTINGS_FACT_TYPES.closedDayRemoved, this.serviceDay);
  }
}

function closedDayFact(type: JournalFactType, serviceDay: string): JournalFact {
  return {
    type,
    subjectType: CLOSED_DAY_SUBJECT,
    subjectId: serviceDay,
    payload: { subjectLabel: serviceDay, serviceDay },
  };
}

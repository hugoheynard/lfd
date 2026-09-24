import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { StorefrontChanges } from "./storefront-changes.js";

/** Il n'y a qu'une vitrine : c'est son identifiant, en base comme au journal. */
export const STOREFRONT_ID = "main";

export const STOREFRONT_FACTS = {
  saved: "storefront.saved",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * **La vitrine a été enregistrée** — donc publiée : ce lot n'a pas de
 * brouillon (plan, D6).
 *
 * Tracé dans la transaction de l'enregistrement (`publishTraced`), parce que
 * c'est la SEULE trace de qui a vidé un rayon : une vitrine se réécrit en
 * bloc, et rien d'autre ne garde l'état d'avant. L'auteur est celui de la
 * requête, posé par le journal.
 *
 * ⚠️ Son préfixe `storefront.` est rangé côté serveur
 * (`growth/domain/activity-module.ts`) ; le libellé de la ligne au front
 * (`shared/journal/phrases/`) reste à écrire avec l'éditeur (lot 3).
 */
export class StorefrontSavedEvent implements JournaledEvent {
  constructor(
    readonly revision: number,
    readonly changes: StorefrontChanges,
  ) {}

  journalFact(): JournalFact {
    return {
      type: STOREFRONT_FACTS.saved,
      subjectType: "storefront",
      subjectId: STOREFRONT_ID,
      payload: {
        subjectLabel: "Vitrine",
        revision: this.revision,
        added: [...this.changes.added],
        moved: [...this.changes.moved],
        archived: [...this.changes.archived],
        shelves: [...this.changes.shelves],
      },
    };
  }
}

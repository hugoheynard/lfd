import type { JournalFact } from "../journal-fact.js";
import { Journal } from "../journal.js";

/**
 * Journal de la plateforme, en test : il garde ce qu'on lui donne — ou tombe
 * en panne sur commande.
 *
 * Le jumeau de `pim/journal/__tests__/recording-journal.ts`, un cran plus bas :
 * celui-là double `PimJournal`, que seul le référentiel a le droit de voir. Les
 * blocs qui appellent `Journal.append` directement (l'équipe, depuis le
 * 2026-09-18) avaient besoin du leur.
 */
export class RecordingJournal extends Journal {
  readonly facts: JournalFact[] = [];

  /** @param failure si fournie, chaque `append` la rejette — la panne d'`INSERT`. */
  constructor(private readonly failure: Error | null = null) {
    super();
  }

  append(fact: JournalFact): Promise<void> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    this.facts.push(fact);
    return Promise.resolve();
  }

  /** Les types journalisés, dans l'ordre — l'assertion la plus fréquente. */
  types(): string[] {
    return this.facts.map((fact) => fact.type);
  }
}

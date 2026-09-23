import { STRICT_JOURNAL_FACTS } from "../../../platform/journal/__tests__/strict-journal-facts.js";
import { MediaJournal, type MediaJournalEntry } from "../media-journal.js";

/**
 * Journal de test de la médiathèque : il garde ce qu'on lui donne.
 *
 * Jumeau de celui du référentiel (`pim/journal/__tests__/recording-journal.ts`)
 * — **et pas le même**, depuis que le fonds a son port. Les spécifications de
 * ce bloc doublaient `PimJournal`, ce qui revenait à éprouver la médiathèque
 * contre le contrat d'un bloc voisin : un doublé qui joue le mauvais port est
 * vert sur du code cassé.
 *
 * Il confronte chaque fait au catalogue, strictement. Pas de portée à replier
 * ici : une entrée du fonds n'en porte pas (voir {@link MediaJournalEntry}).
 */
export class RecordingMediaJournal extends MediaJournal {
  readonly entries: MediaJournalEntry[] = [];

  record(entry: MediaJournalEntry): Promise<void> {
    STRICT_JOURNAL_FACTS.verify(entry.type, entry.payload);
    this.entries.push(entry);
    return Promise.resolve();
  }

  /** Les types journalisés, dans l'ordre — l'assertion la plus fréquente. */
  types(): string[] {
    return this.entries.map((entry) => entry.type);
  }
}

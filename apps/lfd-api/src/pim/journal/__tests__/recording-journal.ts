import { STRICT_JOURNAL_FACTS } from "../../../platform/journal/__tests__/strict-journal-facts.js";
import { PimJournal, type PimJournalEntry } from "../pim-journal.js";

/**
 * Journal de test : il garde ce qu'on lui donne.
 *
 * Partagé par les suites des handlers plutôt que redéclaré dans chacune — c'est
 * la même dépendance, et un double par fichier finirait par diverger du port.
 *
 * Il confronte chaque fait au catalogue, strictement, avec la charge telle que
 * le journal réel l'écrit — la portée versée sous `blast`
 * (`appBootstrap/journal.module.ts`).
 */
export class RecordingJournal extends PimJournal {
  readonly entries: PimJournalEntry[] = [];

  record(entry: PimJournalEntry): Promise<void> {
    const payload =
      entry.blast === undefined ? entry.payload : { ...entry.payload, blast: entry.blast };
    STRICT_JOURNAL_FACTS.verify(entry.type, payload);
    this.entries.push(entry);
    return Promise.resolve();
  }

  /** Les types journalisés, dans l'ordre — l'assertion la plus fréquente. */
  types(): string[] {
    return this.entries.map((entry) => entry.type);
  }
}

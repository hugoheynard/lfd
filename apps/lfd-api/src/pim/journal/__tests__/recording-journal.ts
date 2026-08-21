import { PimJournal, type PimJournalEntry } from "../pim-journal.js";

/**
 * Journal de test : il garde ce qu'on lui donne.
 *
 * Partagé par les suites des handlers plutôt que redéclaré dans chacune — c'est
 * la même dépendance, et un double par fichier finirait par diverger du port.
 */
export class RecordingJournal extends PimJournal {
  readonly entries: PimJournalEntry[] = [];

  record(entry: PimJournalEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  /** Les types journalisés, dans l'ordre — l'assertion la plus fréquente. */
  types(): string[] {
    return this.entries.map((entry) => entry.type);
  }
}

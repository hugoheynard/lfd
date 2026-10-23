import type { MailCopyEntryState } from "../domain/mail-copy-entry.js";

/**
 * Les deux lectures que le cache du publié fait en base — séparées parce
 * qu'elles n'ont pas le même prix : la version est UNE petite ligne, relue
 * souvent ; les textes publiés ne se relisent que quand elle a bougé. Interne
 * à l'infrastructure : seul le cache en dépend.
 */
export abstract class PublishedMailCopyStore {
  abstract version(): Promise<number>;
  /** Les lignes qui portent un texte publié, toutes langues. */
  abstract published(): Promise<readonly MailCopyEntryState[]>;
}

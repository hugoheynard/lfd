import type { MailCopyEntry } from "../mail-copy-entry.js";
import type { MailCopyLocale } from "../mail-copy-locale.js";

/** Port d'écriture d'**un texte d'e-mail** — l'agrégat entier, jamais une colonne. */
export abstract class MailCopyRepository {
  /** Le texte ; jamais `null` — un texte jamais écrit se charge en révision 0. */
  abstract load(mail: string, path: string, locale: MailCopyLocale): Promise<MailCopyEntry>;

  /**
   * Enregistre, à condition que la révision en base soit encore celle d'avant
   * le geste (`revision - 1`) — un seul ordre atomique.
   *
   * @throws {MailCopyChangedError} quelqu'un a écrit depuis le chargement.
   */
  abstract save(entry: MailCopyEntry): Promise<void>;
}

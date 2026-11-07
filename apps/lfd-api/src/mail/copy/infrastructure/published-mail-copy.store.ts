import type { StoredPublishedMailCharter } from "../../charters/application/servable-mail-charter.js";
import type { StoredMailSender } from "../../senders/application/servable-mail-sender.js";
import type { StoredPublishedMailDocument } from "../../documents/application/servable-mail-document.js";
import type { MailCopyEntryState } from "../domain/mail-copy-entry.js";
import type { MailSectionOrderState } from "../domain/mail-section-order.js";

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
  /** Les ordres de sections qui portent un ordre publié (E4). */
  abstract publishedSectionOrders(): Promise<readonly MailSectionOrderState[]>;
  /** Les documents d'e-mails publiés (S4c), colonne `jsonb` encore à relire. */
  abstract publishedDocuments(): Promise<readonly StoredPublishedMailDocument[]>;
  /** Les chartes publiées des espaces (C1, § 25), colonne `jsonb` encore à relire. */
  abstract publishedCharters(): Promise<readonly StoredPublishedMailCharter[]>;
  /** Les identités d'envoi des espaces (C3, § 25) : une ligne rangée est en service. */
  abstract senders(): Promise<readonly StoredMailSender[]>;
}

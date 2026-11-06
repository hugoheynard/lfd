/**
 * Les langues des e-mails. Déclarées ici plutôt qu'importées du contrat : le
 * domaine ne dépend de rien, et la base les tient aussi (CHECK).
 */
export const MAIL_COPY_LOCALES = ["fr", "en", "it"] as const;
export type MailCopyLocale = (typeof MAIL_COPY_LOCALES)[number];

/** La langue de référence (C4) : celle dont un changement rend les autres suspectes. */
export const REFERENCE_LOCALE: MailCopyLocale = "fr";

/** Les textes qu'un aperçu ou un essai emploie : les brouillons, ou ce qui part aujourd'hui. */
export const MAIL_COPY_SOURCES = ["draft", "published"] as const;
export type MailCopySource = (typeof MAIL_COPY_SOURCES)[number];

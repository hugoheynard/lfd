import { MAIL_COPY_LOCALES, REFERENCE_LOCALE, type MailCopyLocale } from "./mail-copy-locale.js";

/**
 * Les traductions qui n'ont pas suivi le français (C4) : celles dont le dernier
 * geste de brouillon est ANTÉRIEUR au dernier geste sur le français — ou qui
 * n'ont jamais été touchées alors que le français l'a été.
 *
 * Un avertissement, pas un refus : une traduction peut rester juste après un
 * français reformulé. L'écran le signale, le rédacteur juge. Même règle que
 * `staleTranslations` des textes de la boutique, recopiée plutôt qu'importée :
 * deux contextes, deux écrans, qui peuvent diverger.
 */
export function staleMailTranslations(
  touchedAt: Readonly<Partial<Record<MailCopyLocale, Date | null>>>,
): readonly MailCopyLocale[] {
  const reference = touchedAt[REFERENCE_LOCALE] ?? null;
  if (reference === null) {
    return [];
  }
  return MAIL_COPY_LOCALES.filter((locale) => locale !== REFERENCE_LOCALE).filter((locale) => {
    const at = touchedAt[locale] ?? null;
    return at === null || at.getTime() < reference.getTime();
  });
}

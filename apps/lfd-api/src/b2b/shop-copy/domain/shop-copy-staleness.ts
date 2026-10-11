import { REFERENCE_LOCALE, SHOP_COPY_LOCALES, type ShopCopyLocale } from "./shop-copy-locale.js";

/**
 * Les traductions qui n'ont pas suivi le français (A2) : celles dont le
 * dernier geste de brouillon est ANTÉRIEUR au dernier geste sur le français —
 * ou qui n'ont jamais été touchées alors que le français l'a été.
 *
 * Un avertissement, pas un refus : une traduction peut rester juste après un
 * français reformulé. L'écran le signale, le rédacteur juge.
 */
export function staleTranslations(
  touchedAt: Readonly<Partial<Record<ShopCopyLocale, Date | null>>>,
): readonly ShopCopyLocale[] {
  const reference = touchedAt[REFERENCE_LOCALE] ?? null;
  if (reference === null) {
    return [];
  }
  return SHOP_COPY_LOCALES.filter((locale) => locale !== REFERENCE_LOCALE).filter((locale) => {
    const at = touchedAt[locale] ?? null;
    return at === null || at.getTime() < reference.getTime();
  });
}

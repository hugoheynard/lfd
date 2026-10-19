import type { ContentLocale } from "@lfd/contracts";

/**
 * La langue que le commerce a toujours parlée : celle de `name` et `note`, et
 * le repli de toutes les autres. Le référentiel en fait sa langue source ; ici
 * elle est seulement celle qui ne manque jamais.
 */
export const CATALOG_SOURCE_LANGUAGE = "fr" satisfies ContentLocale;

/** Les langues qui se traduisent — toutes celles de la boutique, sauf la source. */
export type TranslatedLanguage = Exclude<ContentLocale, typeof CATALOG_SOURCE_LANGUAGE>;

/**
 * **Les traductions d'un texte reçu du référentiel** (lot des langues,
 * 2026-10-18 — `documentation/webhooks/vitrine.md` §5) : une
 * entrée par langue traduite, la source restant dans le champ qu'elle a
 * toujours occupé. Une langue absente n'a pas d'entrée.
 */
export type CatalogTranslations = Readonly<Partial<Record<TranslatedLanguage, string>>>;

/** Rien de traduit — ou rien de reçu : les deux se servent en français. */
export const NO_TRANSLATIONS: CatalogTranslations = {};

/**
 * **Le texte dans la langue demandée, sinon en français** — le repli écrit une
 * fois.
 *
 * Une langue absente retombe sur la source, jamais sur une chaîne vide : un
 * visiteur anglais lit « Croissant au beurre » plutôt qu'une carte muette.
 * `null` (un texte qui n'existe pas, une ligne sans note) reste `null` dans
 * toutes les langues : une traduction sans original n'a rien à remplacer.
 */
export function inLanguage(
  source: string,
  translations: CatalogTranslations,
  language: ContentLocale,
): string;
export function inLanguage(
  source: string | null,
  translations: CatalogTranslations,
  language: ContentLocale,
): string | null;
export function inLanguage(
  source: string | null,
  translations: CatalogTranslations,
  language: ContentLocale,
): string | null {
  if (source === null || language === CATALOG_SOURCE_LANGUAGE) {
    return source;
  }
  return translations[language] ?? source;
}

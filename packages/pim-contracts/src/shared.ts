/**
 * Types de fil **communs** aux contextes du PIM. Pas de Zod ici : ce sont des
 * **vues** (formes rendues), pas des payloads validés.
 */

/**
 * Les langues du catalogue, **dans l'ordre de lecture**. C'est LA liste : tout
 * ce qui suit en dérive, et ouvrir une langue est une entrée de plus ici — pas
 * un champ de plus dans dix types, ni une migration.
 *
 * Le même principe que `SalesChannels.boutiques` plus bas, pour la même raison :
 * une dimension qui grandit se pilote par la donnée, jamais par des clés fixes.
 * `nameFr` / `nameEn` étaient exactement ces clés fixes, et une troisième langue
 * demandait de les retrouver aux quatre coins du monorepo.
 */
export const LOCALES = ["fr", "en", "it"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * La langue **source** : la seule obligatoire, et le repli de toutes les autres.
 * Le français fait foi (décision J1) ; une fiche sans français n'existe pas,
 * une fiche sans italien est simplement à traduire.
 */
export const SOURCE_LOCALE = "fr" satisfies Locale;

/** Les langues qui se traduisent — toutes sauf la source. */
export type TranslatedLocale = Exclude<Locale, typeof SOURCE_LOCALE>;

/**
 * Texte traduisible (stocké `jsonb`, donc une locale de plus ne coûte rien au
 * schéma). La langue source est requise par le TYPE, pas par une convention :
 * lire `text.fr` ne peut pas rendre `undefined`, et c'est ce qui rend le repli
 * total sans test d'existence à chaque appel.
 */
export type LocalizedText = Readonly<
  Record<typeof SOURCE_LOCALE, string> & Partial<Record<TranslatedLocale, string>>
>;

/**
 * Le repli, écrit une fois. Une locale absente retombe sur la source — jamais
 * sur une chaîne vide, qui donnerait un écran muet là où le français existe.
 */
export function readLocalized(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text[SOURCE_LOCALE];
}

/**
 * Pose une valeur dans une locale, sans toucher aux autres.
 *
 * C'est le geste que fait un écran de saisie, et il est écrit ici parce qu'il
 * porte une règle : une valeur vide **efface** la locale plutôt que d'y laisser
 * une chaîne vide. Sans ça, vider un champ de traduction laisserait la fiche
 * comptée comme traduite par tout ce qui lit {@link filledLocales}.
 *
 * La langue source ne s'efface pas — elle est requise par le type ; y écrire du
 * vide rend le texte inchangé, et c'est à la validation de l'écran de le dire.
 */
export function writeLocalized(text: LocalizedText, locale: Locale, value: string): LocalizedText {
  const trimmed = value.trim();
  if (locale === SOURCE_LOCALE) {
    return trimmed === "" ? text : { ...text, [SOURCE_LOCALE]: trimmed };
  }
  const next: Record<string, string> = {};
  for (const known of LOCALES) {
    const existing = known === locale ? trimmed : (text[known] ?? "");
    if (existing !== "") {
      next[known] = existing;
    }
  }
  return { ...next, [SOURCE_LOCALE]: text[SOURCE_LOCALE] };
}

/** Les locales réellement renseignées, dans l'ordre de {@link LOCALES}. */
export function filledLocales(text: LocalizedText): readonly Locale[] {
  return LOCALES.filter((locale) => (text[locale] ?? "").trim() !== "");
}

/** Celles qui manquent — ce qu'un sélecteur de langue marque d'un point. */
export function missingLocales(text: LocalizedText): readonly Locale[] {
  const filled = filledLocales(text);
  return LOCALES.filter((locale) => !filled.includes(locale));
}

/** Un canal **vendu** : un contexte, et le lieu depuis lequel il se vend. */
export interface SoldChannel {
  /**
   * `null` = contexte **sans lieu** — le B2B aujourd'hui. On ne commande pas à
   * une boutique : ce n'est pas une absence de donnée, c'est la donnée.
   */
  readonly locationId: string | null;
  /** La clé du contexte, telle que le registre la porte. */
  readonly context: string;
}

/**
 * Où et comment une gamme se vend — un **ensemble de paires**.
 *
 * Les emplacements ÉTAIENT déjà une donnée ; les **modes** ne l'étaient pas. La
 * carte s'écrivait `{ boutiques: Record<id, { emporter, surPlace }>, b2b }`, si
 * bien qu'un écran ne pouvait pas afficher un quatrième contexte de vente sans
 * qu'on le livre. Les paires suppriment la distinction : un contexte de plus
 * est une ligne de plus au registre, de bout en bout.
 *
 * Une paire absente n'est pas un faux : on n'écrit que ce qui est vendu.
 */
export type SalesChannels = readonly SoldChannel[];

/** Réponse standard d'une création : l'identifiant assigné par la commande (R1). */
export interface CreatedIdResponse {
  readonly id: string;
}

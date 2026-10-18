import {
  LOCALES,
  SOURCE_LOCALE,
  type LocalizedText,
  type TranslatedLocale,
} from "@lfd/pim-contracts";
import { z } from "zod";

/**
 * **Les traductions d'un texte**, langue source exclue — le français voyage à
 * côté, dans le champ qu'il a toujours occupé (`name`, `note`).
 *
 * Une carte et non des champs nommés : ouvrir une langue au référentiel
 * (`LOCALES`) l'ajoute ici sans toucher au fil. Une langue absente n'a pas
 * d'entrée — jamais une chaîne vide, qui dirait « effacé ».
 *
 * ⚠️ `null` dans un fait = **fait émis avant le lot des langues** (2026-10-18) :
 * on ne sait pas, et le récepteur sert le français. `{}` = on sait, et rien
 * n'est traduit.
 */
export type CatalogTranslations = Readonly<Partial<Record<TranslatedLocale, string>>>;

/** Les traductions d'un texte du référentiel ; `null` (aucun texte) n'en a aucune. */
export function translationsOf(text: LocalizedText | null): CatalogTranslations {
  const translations: Partial<Record<TranslatedLocale, string>> = {};
  if (text === null) {
    return translations;
  }
  for (const locale of LOCALES) {
    if (locale === SOURCE_LOCALE) {
      continue;
    }
    const value = text[locale];
    if (value !== undefined) {
      translations[locale] = value;
    }
  }
  return translations;
}

/**
 * Les traductions du nom d'une **déclinaison**, avec repli sur celles de la
 * **fiche** langue par langue — mais seulement quand la déclinaison porte, en
 * français, exactement le nom de la fiche.
 *
 * Constaté en production le 2026-10-18 : le staff traduit le nom de la fiche
 * (« Roulé à la cannelle » → « Cinnamon rolls »), jamais celui de sa
 * déclinaison unique, et la vitrine (qui affiche le nom de la déclinaison)
 * restait en français. Une déclinaison au nom différent (« Pain aux olives
 * 2 kg ») ne reçoit rien de la fiche : coller « Olive bread » perdrait le
 * « 2 kg », et on n'invente pas de traduction — le français sert en repli.
 */
export function variantNameTranslationsOf(
  variantName: LocalizedText,
  productName: LocalizedText,
): CatalogTranslations {
  const own = translationsOf(variantName);
  if (variantName[SOURCE_LOCALE] !== productName[SOURCE_LOCALE]) {
    return own;
  }
  return { ...translationsOf(productName), ...own };
}

/**
 * La forme des traductions sur le fil d'un fait — **lue `null` quand elle
 * manque** : un fait émis avant le lot des langues reste lisible, et dit
 * « on ne sait pas » plutôt que « rien n'est traduit ». Une clé inconnue est
 * refusée (`partialRecord`), une langue source aussi : elle voyage à côté.
 */
export const catalogTranslationsSchema = z
  .partialRecord(z.enum(LOCALES).exclude([SOURCE_LOCALE]), z.string().min(1))
  .nullable()
  .default(null);

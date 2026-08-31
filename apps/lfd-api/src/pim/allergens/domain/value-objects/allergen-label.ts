import { LOCALES, SOURCE_LOCALE, type LocalizedText } from "@lfd/pim-contracts";

import { AllergenLabelRequiredError } from "../errors/allergen-errors.js";

/**
 * Nettoie un libellé d'allergène et exige la langue source.
 *
 * Le nettoyage vit dans le domaine et non à la frontière : c'est l'agrégat qui
 * décide de ce qu'il stocke, et un libellé entouré d'espaces s'écrirait sinon
 * tel quel sur une étiquette. Une locale vidée est **retirée**, jamais gardée
 * en chaîne vide — sinon tout ce qui compte les langues remplies compterait une
 * traduction qui n'existe pas.
 *
 * Une fonction et non une classe, à l'inverse du code et de la clé : un libellé
 * ne circule pas comme une identité, il ne se compare pas, il se nettoie. C'est
 * le même partage que `cleanRequiredText` dans le contexte voisin.
 *
 * @param what ce dont on parle, tel qu'il apparaîtra dans le refus.
 * @throws {AllergenLabelRequiredError} rien de lisible dans la langue source.
 */
export function cleanLabel(what: string, text: LocalizedText): LocalizedText {
  const cleaned: Partial<Record<string, string>> = {};
  for (const locale of LOCALES) {
    const value = text[locale]?.trim();
    if (value !== undefined && value !== "") {
      cleaned[locale] = value;
    }
  }
  const source = cleaned[SOURCE_LOCALE];
  if (source === undefined) {
    throw new AllergenLabelRequiredError(what);
  }
  return { ...cleaned, [SOURCE_LOCALE]: source };
}

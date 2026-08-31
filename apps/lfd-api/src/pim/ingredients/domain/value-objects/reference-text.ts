import { LOCALES, SOURCE_LOCALE, type LocalizedText } from "@lfd/pim-contracts";

import {
  LocalizedNameRequiredError,
  ReferenceKeyInvalidError,
} from "../errors/ingredient-errors.js";

/** La forme d'une identité de référentiel — minuscules, chiffres, tirets. */
const KEY_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Nettoie une identité et la valide, une fois pour toutes.
 *
 * Nettoyer AVANT de valider, et rendre la version nettoyée : c'est elle qui
 * part en base, et c'est donc elle que le handler doit vérifier libre. Valider
 * l'une puis écrire l'autre est le défaut classique de ce genre de porte.
 */
export function cleanKey(what: string, raw: string): string {
  const key = raw.trim();
  if (!KEY_SHAPE.test(key)) {
    throw new ReferenceKeyInvalidError(what, raw);
  }
  return key;
}

/**
 * Nettoie un texte localisé et exige la langue source.
 *
 * Le nettoyage vit dans le domaine plutôt qu'à la frontière parce que c'est
 * l'agrégat qui décide de ce qu'il stocke : un libellé entouré d'espaces
 * s'écrirait sinon tel quel en base, et le journal en garderait la trace fidèle
 * d'une valeur fausse.
 *
 * Une locale vidée est **retirée**, jamais gardée en chaîne vide : sans ça,
 * tout ce qui compte les langues remplies compterait une traduction qui n'existe
 * pas.
 */
export function cleanRequiredText(what: string, text: LocalizedText): LocalizedText {
  const cleaned = cleanOptionalText(text);
  if (cleaned === null) {
    throw new LocalizedNameRequiredError(what);
  }
  return cleaned;
}

/** La même chose, mais un texte entièrement vide vaut « rien n'a été écrit ». */
export function cleanOptionalText(text: LocalizedText | null | undefined): LocalizedText | null {
  if (text === null || text === undefined) {
    return null;
  }
  const cleaned: Partial<Record<string, string>> = {};
  for (const locale of LOCALES) {
    const value = text[locale]?.trim();
    if (value !== undefined && value !== "") {
      cleaned[locale] = value;
    }
  }
  const source = cleaned[SOURCE_LOCALE];
  return source === undefined ? null : { ...cleaned, [SOURCE_LOCALE]: source };
}

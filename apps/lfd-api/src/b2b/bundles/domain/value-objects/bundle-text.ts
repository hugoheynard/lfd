import { InvalidBundleTextError } from "../errors/bundle-errors.js";

/** Le nom d'une formule : ce que la carte de la boutique affiche en titre. */
export const BUNDLE_NAME_MAX_LENGTH = 80;
/** La description : une ligne sous le nom, pas un paragraphe. */
export const BUNDLE_DESCRIPTION_MAX_LENGTH = 240;
/** Le libellé d'un groupe : un mot ou deux au-dessus de ses choix. */
export const BUNDLE_GROUP_LABEL_MAX_LENGTH = 40;

/** Au moins une lettre ou un chiffre — un texte fait de tirets ne nomme rien. */
const SOMETHING_SAID = /[\p{L}\p{N}]/u;

/**
 * Un texte de formule, nettoyé de ses blancs de bord, non vide et borné.
 *
 * @param field le nom du champ, tel que le message le dira (« Le nom »).
 * @throws {InvalidBundleTextError} vide, sans lettre ni chiffre, ou trop long.
 */
export function boundedText(raw: string, field: string, max: number): string {
  const text = raw.trim();
  if (text.length > max || !SOMETHING_SAID.test(text)) {
    throw new InvalidBundleTextError(field, max);
  }
  return text;
}

/** La description : `null` ou vide = aucune ; sinon bornée comme un texte. */
export function optionalDescription(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") {
    return null;
  }
  return boundedText(raw, "La description", BUNDLE_DESCRIPTION_MAX_LENGTH);
}

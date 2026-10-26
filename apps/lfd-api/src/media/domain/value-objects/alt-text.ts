import {
  isMediaAltWritten,
  LOCALES,
  SOURCE_LOCALE,
  type DraftAlt,
  type Locale,
  type LocalizedText,
} from "@lfd/pim-contracts";

import { buildLocalized, type Languages } from "../../../platform/i18n/localized-text.js";
import { DomainError } from "../../../platform/shared/errors/app-error.js";

export type { LocalizedText };
export { SOURCE_LOCALE };

/**
 * Les langues dans lesquelles une image se décrit.
 *
 * Ce sont celles du catalogue, lues dans le CONTRAT (`@lfd/pim-contracts`) et
 * non dans le bloc `pim/` : la médiathèque les empruntait au référentiel
 * jusqu'au 2026-10-10, ce qui ouvrait `media→pim` sur le bloc entier pour une
 * liste de trois langues. La mécanique est en `platform/i18n/`.
 */
export const MEDIA_LANGUAGES: Languages<typeof SOURCE_LOCALE, Locale> = {
  source: SOURCE_LOCALE,
  all: LOCALES,
};

/** Le texte alternatif d'une image : la langue source obligatoire, les autres facultatives. */
export function altText(
  field: string,
  values: Partial<Record<Locale, string | undefined>>,
): LocalizedText {
  return buildLocalized(MEDIA_LANGUAGES, field, values);
}

/**
 * **L'absence d'alternative** : la langue source vide, aucune traduction.
 *
 * Vide et pas `null` : la colonne `alt` est obligatoire et sa lecture admet
 * une source vide (`readLocalizedColumn`) ; le contrat servi garde sa forme.
 * Un lecteur d'écran saute une alternative vide — il lisait l'URL jusqu'au
 * 2026-10-26 (pré-audit RGAA : 58 images sur 89 de la boutique).
 */
export const NO_ALT: LocalizedText = Object.freeze({ [SOURCE_LOCALE]: "" });

/** Une alternative qui est une URL, un chemin ou un nom de fichier : ce n'est pas une description. */
export class NonDescriptiveAltError extends DomainError {
  constructor(readonly text: string) {
    super(
      "media.alt_not_descriptive",
      `« ${text} » n'est pas un texte alternatif : une adresse ou un nom de fichier ne décrit pas l'image. Écrivez ce qu'elle montre, ou laissez le champ vide.`,
    );
  }
}

/**
 * L'alternative d'une image telle qu'elle se range : celle qu'on a écrite, ou
 * {@link NO_ALT} faute de source.
 *
 * L'absence et pas un refus : « je n'ai pas encore écrit d'alternative » est un
 * état légitime du fonds — au dépôt, personne n'est là pour l'écrire. L'URL de
 * l'image elle-même vaut absence (les écrans renvoyaient l'ancien repli) ; une
 * AUTRE URL, un chemin ou un nom de fichier sont refusés : quelqu'un a cru
 * décrire l'image, et le lui taire laisserait la faute en place.
 */
export function imageAlt(draft: DraftAlt | null, url: string): LocalizedText {
  if (isMediaAltWritten(draft, url)) {
    return altText("texte alternatif", draft ?? {});
  }
  const source = draft?.[SOURCE_LOCALE]?.trim() ?? "";
  if (source !== "" && source !== url) {
    throw new NonDescriptiveAltError(source);
  }
  return NO_ALT;
}

/**
 * L'alternative telle qu'elle se LIT : la rangée si elle décrit l'image,
 * {@link NO_ALT} sinon — colonne illisible, vide, ou héritée de l'ancien repli
 * sur l'URL (lignes déposées avant le 2026-10-26, cf.
 * `documentation/mediatheque/plan-alternatives-urls.md`).
 */
export function storedAlt(stored: LocalizedText | null, url: string): LocalizedText {
  return stored !== null && isMediaAltWritten(stored, url) ? stored : NO_ALT;
}

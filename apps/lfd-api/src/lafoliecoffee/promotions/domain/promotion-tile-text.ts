import {
  PromotionTileTextNotCanonicalError,
  PromotionTileTextTooLongError,
  PromotionTileTextWithoutFrenchError,
} from "./errors/promotion-tile-text-errors.js";
import type { PromotionLabel, PromotionLabelLanguage } from "./promotion-labels.js";

/**
 * La longueur maximale du texte sur les vignettes. Soixante caractères disent
 * « −20 % client Folie Coffee » et sa traduction sans déborder d'une vignette ;
 * la colonne porte le même CHECK (migration `20261101120000_le_texte_des_vignettes`).
 */
export const PROMOTION_TILE_TEXT_MAX_LENGTH = 60;

/**
 * **Le texte d'une promotion sur les vignettes**
 * (`documentation/promotions/plan-texte-de-la-vignette.md`) — même forme qu'un
 * libellé : le français, et l'anglais et l'italien `null` = repli sur le
 * français. Le texte entier `null` = la boutique dit la valeur seule.
 */
export type PromotionTileText = PromotionLabel;

/** Le texte saisi, une langue : espaces de bord retirés, vide → `null`. */
function canonical(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * **Le texte saisi, en forme canonique** : chaque langue sans espaces de
 * bord, vide → `null` ; sans français, tout le texte vaut `null`… sauf s'il
 * reste une traduction, qui n'aurait rien à quoi se replier.
 *
 * @throws {PromotionTileTextWithoutFrenchError} une traduction sans français.
 * @throws {PromotionTileTextTooLongError} une langue au-delà de la borne.
 */
export function promotionTileTextOf(
  raw: {
    readonly fr: string | null;
    readonly en: string | null;
    readonly it: string | null;
  } | null,
): PromotionTileText | null {
  if (raw === null) {
    return null;
  }
  const fr = canonical(raw.fr);
  const en = canonical(raw.en);
  const it = canonical(raw.it);
  if (fr === null) {
    if (en !== null || it !== null) {
      throw new PromotionTileTextWithoutFrenchError();
    }
    return null;
  }
  const text = { fr, en, it };
  assertTileText(text);
  return text;
}

/**
 * Un texte posé est déjà canonique et borné, dans chaque langue. Appelée à la
 * pose, à la révision et à la relecture.
 *
 * @throws {PromotionTileTextTooLongError} une langue au-delà de la borne.
 * @throws {PromotionTileTextNotCanonicalError} une langue vide ou bordée d'espaces.
 */
export function assertTileText(text: PromotionTileText | null): void {
  if (text === null) {
    return;
  }
  for (const value of [text.fr, text.en, text.it]) {
    if (value === null) {
      continue;
    }
    if (value.length > PROMOTION_TILE_TEXT_MAX_LENGTH) {
      throw new PromotionTileTextTooLongError(value.length, PROMOTION_TILE_TEXT_MAX_LENGTH);
    }
    if (value === "" || value.trim() !== value) {
      throw new PromotionTileTextNotCanonicalError();
    }
  }
}

/** Le texte lu dans une langue, repli sur le français ; `null` = la valeur seule. */
export function tileTextIn(
  text: PromotionTileText | null,
  language: PromotionLabelLanguage,
): string | null {
  return text === null ? null : (text[language] ?? text.fr);
}

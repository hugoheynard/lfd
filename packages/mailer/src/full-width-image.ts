import {
  MAIL_CARD_INNER_WIDTH_PX,
  type ImageBlock,
  type MailBlock,
  type MailLocale,
} from "@lfd/mail-blocks";

import { htmlEscape } from "./escape.js";
import { imageElement, type FreeBlockAudience, type ImageSizing } from "./document-image.js";
import { IMAGE_GAP_PX } from "./card-geometry.js";

/**
 * **L'image pleine largeur** (Hugo, 2026-11-08) : d'un bord de la carte à
 * l'autre, comme le bandeau. Elle ne se rend pas DANS la cellule à marges du
 * corps : le corps est coupé à sa place (`card-rows.ts`), et elle occupe sa
 * propre ligne de la carte.
 *
 * Pour les messageries :
 * - `width` en PIXELS en attribut (la largeur intérieure de la carte) —
 *   Outlook pour Windows ignore `max-width` et le `width` CSS d'une image ;
 *   les autres lisent `width:100%` et la réduisent sur téléphone ;
 * - `display:block` et une cellule à `font-size:0;line-height:0` — sans quoi
 *   une image en ligne laisse sous elle la hauteur d'une ligne de texte ;
 * - `border:0`, et l'arrondi de la carte du côté où l'image en touche le
 *   bord : une table arrondie ne rogne pas ce qu'elle contient.
 */

/** Ce qui touche le haut de l'image. */
export type FullWidthTop = "header" | "card-edge" | "content";

/** Ce qui touche le bas de l'image. */
export type FullWidthBottom = "footer" | "card-edge" | "content";

/** La place d'une image pleine largeur dans la carte. */
export interface FullWidthPlacement {
  readonly top: FullWidthTop;
  readonly bottom: FullWidthBottom;
}

/** L'espace entre la dernière ligne d'une image et le pied de la carte. */
const FOOTER_GAP_PX = 24;

/** Une image hors colonne réglée pleine largeur. */
export function isFullWidthImage(block: MailBlock): block is ImageBlock {
  return block.kind === "image" && block.width === "full";
}

function cornerRadius(placement: FullWidthPlacement, radius: string): string {
  const top = placement.top === "card-edge" ? `${radius} ${radius}` : "0 0";
  const bottom = placement.bottom === "card-edge" ? `${radius} ${radius}` : "0 0";
  return top === "0 0" && bottom === "0 0" ? "" : `border-radius:${top} ${bottom};`;
}

function sizingOf(radius: string): ImageSizing {
  const px = String(MAIL_CARD_INNER_WIDTH_PX);
  return {
    widthAttribute: px,
    style: `display:block;width:100%;max-width:${px}px;height:auto;border:0;${radius}`,
    canvasAttributes: ` data-image-width="full"`,
  };
}

/** L'image seule, bord à bord ; vide si elle n'a rien à montrer. */
export function fullWidthImageElement(
  block: ImageBlock,
  locale: MailLocale,
  audience: FreeBlockAudience,
  placement: FullWidthPlacement,
  radius: string,
): string {
  return imageElement(block, locale, audience, sizingOf(cornerRadius(placement, radius)));
}

/**
 * La ligne de la carte (`<tr>`) qui porte une image déjà rendue
 * (`fullWidthImageElement`). Collée au bandeau, au bord de la carte ;
 * séparée d'un contenu au-dessus par l'espace d'une image du corps, et du
 * pied par celui d'un pied. `marked` (aperçu à sections marquées) : la
 * cellule porte `data-mail-block`, comme le `<div>` d'un bloc du corps.
 */
export function fullWidthImageRow(
  blockId: string,
  element: string,
  placement: FullWidthPlacement,
  radius: string,
  marked: boolean,
): string {
  const top = placement.top === "content" ? IMAGE_GAP_PX : 0;
  const bottom = placement.bottom === "footer" ? FOOTER_GAP_PX : 0;
  const mark = marked ? ` data-mail-block="${htmlEscape(blockId)}"` : "";
  return `<tr><td${mark} style="padding:${String(top)}px 0 ${String(bottom)}px;font-size:0;line-height:0;${cornerRadius(placement, radius)}">${element}</td></tr>`;
}

/**
 * L'image d'un objet de vitrine — cadrage et côté (`boutique-rayon-layout.md`,
 * « L'image se règle sur l'objet »). Fonctions pures, sans dépendance.
 */

import type { PlacedBlock, StorefrontShape } from "./grid.js";
import { MOBILE_COLUMNS, mobileFormat } from "./mobile.js";

/** Cadrage de l'image : `cover` remplit et rogne, `contain` la montre entière sur le fond. */
export const MEDIA_FITS = ["cover", "contain"] as const;
export type MediaFit = (typeof MEDIA_FITS)[number];

/** Côté de l'image dans l'objet ; `full` la met sous tout l'objet, texte par-dessus. */
export const MEDIA_SIDES = ["left", "right", "top", "full"] as const;
export type MediaSide = (typeof MEDIA_SIDES)[number];

export const DEFAULT_MEDIA_FIT: MediaFit = "cover";

const SIDES_NARROW: readonly MediaSide[] = ["top", "full"];
const SIDES_WIDE: readonly MediaSide[] = ["left", "right", "full"];
const SIDES_BLOCK: readonly MediaSide[] = ["left", "right", "top", "full"];

/** Les côtés d'image permis par forme ; le PREMIER est le défaut de la forme. */
const SIDES_BY_SHAPE: Readonly<Record<StorefrontShape, readonly MediaSide[]>> = {
  card: SIDES_NARROW,
  kakemono: SIDES_NARROW,
  tile: SIDES_WIDE,
  block: SIDES_BLOCK,
  hero: SIDES_WIDE,
  band: SIDES_WIDE,
  doubleBand: SIDES_WIDE,
};

export function allowedSides(format: StorefrontShape): readonly MediaSide[] {
  return SIDES_BY_SHAPE[format];
}

export function defaultSide(format: StorefrontShape): MediaSide {
  return allowedSides(format)[0] ?? "full";
}

/** Le côté gardé quand la forme change : le même s'il reste permis, sinon le défaut de la nouvelle forme. */
export function sideForShape(format: StorefrontShape, side: MediaSide | undefined): MediaSide {
  return side !== undefined && allowedSides(format).includes(side) ? side : defaultSide(format);
}

export function mediaSideOf(block: PlacedBlock): MediaSide {
  return sideForShape(block.format, block.mediaSide);
}

export function mediaFitOf(block: PlacedBlock): MediaFit {
  return block.mediaFit ?? DEFAULT_MEDIA_FIT;
}

/**
 * Le côté de l'image EN PILE : en haut dès que l'objet y fait deux colonnes ou
 * moins — un partage gauche/droite sur 170 px ferait deux moitiés illisibles.
 * `full` reste plein.
 */
export function mobileSide(block: PlacedBlock): MediaSide {
  const side = mediaSideOf(block);
  if (side === "full") {
    return "full";
  }
  return mobileFormat(block).columns <= MOBILE_COLUMNS ? "top" : side;
}

/** Règle le cadrage et/ou le côté d'un objet ; un côté non permis par sa forme ne change rien. */
export function setMedia(
  blocks: readonly PlacedBlock[],
  id: string,
  media: { readonly fit?: MediaFit; readonly side?: MediaSide },
): readonly PlacedBlock[] {
  return blocks.map((block) => {
    if (block.id !== id) {
      return block;
    }
    const withFit = media.fit === undefined ? block : { ...block, mediaFit: media.fit };
    return media.side === undefined || !allowedSides(block.format).includes(media.side)
      ? withFit
      : { ...withFit, mediaSide: media.side };
  });
}

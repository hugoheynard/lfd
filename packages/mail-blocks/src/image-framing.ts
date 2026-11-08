import { imageCopyWidthPx, type ImageWidth } from "./image-width.js";

/**
 * Le cadrage d'une image d'e-mail (plan `plan-editeur-par-blocs.md`, § 19,
 * « Format et point focal ») : les messageries ne recadrent pas de façon
 * fiable, donc le SERVEUR recadre à la publication (Hugo, 2026-11-07).
 *
 * `original` garde l'image telle quelle ; les trois autres sont des rapports
 * largeur:hauteur, recadrés autour du point focal.
 */
export const IMAGE_FORMATS = ["original", "3:2", "2:1", "1:1"] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** Un format qui recadre : tout sauf `original`. */
export type ImageCropFormat = Exclude<ImageFormat, "original">;

/**
 * Le point de l'image à garder au centre du recadrage, en fractions de la
 * largeur (`x`) et de la hauteur (`y`), de 0 à 1 ; `{ x: 0.5, y: 0.5 }` par
 * défaut.
 */
export interface ImageFocal {
  readonly x: number;
  readonly y: number;
}

/** Le centre, quand aucun point focal n'est posé. */
export const DEFAULT_IMAGE_FOCAL: ImageFocal = { x: 0.5, y: 0.5 };

/** Le rapport largeur / hauteur de chaque format qui recadre. */
export const IMAGE_FORMAT_RATIOS: Readonly<Record<ImageCropFormat, number>> = {
  "3:2": 3 / 2,
  "2:1": 2 / 1,
  "1:1": 1,
};

export function isImageFormat(candidate: unknown): candidate is ImageFormat {
  return IMAGE_FORMATS.some((format) => format === candidate);
}

/** Un point focal lisible : deux nombres finis entre 0 et 1. */
export function isImageFocal(candidate: ImageFocal): boolean {
  const inRange = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
  return inRange(candidate.x) && inRange(candidate.y);
}

/** Ce qu'une image demande à la copie : un format qui recadre, et son point focal. */
export interface ImageFraming {
  readonly format: ImageCropFormat;
  readonly focal: ImageFocal;
}

/**
 * Le cadrage d'un bloc, ou `null` s'il garde l'image d'origine (format absent
 * ou `original` — le point focal y est sans effet).
 */
export function framingOf(block: {
  readonly format?: ImageFormat;
  readonly focal?: ImageFocal;
}): ImageFraming | null {
  if (block.format === undefined || block.format === "original") {
    return null;
  }
  return { format: block.format, focal: block.focal ?? DEFAULT_IMAGE_FOCAL };
}

/**
 * Ce que la copie d'une image demande à la publication : son cadrage
 * (`null` : l'image d'origine) et sa largeur maximale en pixels
 * (`imageCopyWidthPx` — jamais agrandie).
 */
export interface ImageShaping {
  readonly framing: ImageFraming | null;
  readonly maxWidthPx: number;
}

/** La mise en forme de la copie d'un bloc : son cadrage et sa largeur. */
export function imageShapingOf(block: {
  readonly format?: ImageFormat;
  readonly focal?: ImageFocal;
  readonly width?: ImageWidth;
}): ImageShaping {
  return { framing: framingOf(block), maxWidthPx: imageCopyWidthPx(block) };
}

/**
 * La clé d'une copie à la publication : l'adresse source, le cadrage s'il y
 * en a un, et la largeur de la copie. Deux blocs sur la même image en deux
 * formats, ou l'un pleine largeur et l'autre non, font deux copies.
 *
 * La largeur y est depuis le 2026-11-08 (toute copie est bornée en largeur) :
 * une copie rangée avant, clé sans largeur, ne correspond plus et la
 * republication recopie — une image `original` copiée telle quelle, sans
 * borne, ne resservira donc pas.
 */
export function imageCopyKey(block: {
  readonly src: string;
  readonly format?: ImageFormat;
  readonly focal?: ImageFocal;
  readonly width?: ImageWidth;
}): string {
  const framing = framingOf(block);
  const framed = framing === null ? "" : `#${framing.format}@${framing.focal.x},${framing.focal.y}`;
  return `${block.src}${framed}~${String(imageCopyWidthPx(block))}w`;
}

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
 * La clé d'une copie à la publication : l'adresse source, et le cadrage s'il
 * y en a un. Deux blocs sur la même image en deux formats font deux copies ;
 * une image sans cadrage garde l'adresse seule pour clé (le comportement
 * d'avant le cadrage).
 */
export function imageCopyKey(block: {
  readonly src: string;
  readonly format?: ImageFormat;
  readonly focal?: ImageFocal;
}): string {
  const framing = framingOf(block);
  return framing === null
    ? block.src
    : `${block.src}#${framing.format}@${framing.focal.x},${framing.focal.y}`;
}

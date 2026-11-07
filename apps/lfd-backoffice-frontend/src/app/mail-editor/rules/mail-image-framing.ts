import {
  DEFAULT_IMAGE_FOCAL,
  IMAGE_FORMAT_RATIOS,
  isImageFormat,
  type ImageFocal,
  type ImageFormat,
} from '@lfd/mail-blocks';

/**
 * **Le cadrage d'une image vu par l'écran** (plan `plan-editeur-par-blocs.md`,
 * § 19, « Format et point focal ») : les libellés des formats, le repère
 * déplacé au clavier, et le recadrage CSS de l'aperçu. Pur — le recadrage
 * réel est celui du serveur, à la publication.
 */

/** Les formats, dans l'ordre du choix. */
export const IMAGE_FORMAT_OPTIONS: readonly {
  readonly value: ImageFormat;
  readonly label: string;
}[] = [
  { value: 'original', label: 'Originale' },
  { value: '3:2', label: 'Paysage 3:2' },
  { value: '2:1', label: 'Bandeau 2:1' },
  { value: '1:1', label: 'Carré' },
];

/** Le pas d'une flèche : un vingtième de l'image. */
export const FOCAL_KEY_STEP = 0.05;

const KEY_MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Le repère déplacé par une flèche, borné à l'image ; `null` pour une autre
 * touche. Sans point posé, on part du centre.
 */
export function nudgedFocal(focal: ImageFocal | undefined, key: string): ImageFocal | null {
  const move = KEY_MOVES[key];
  if (move === undefined) {
    return null;
  }
  const from = focal ?? DEFAULT_IMAGE_FOCAL;
  return {
    x: unit(Math.round((from.x + move[0] * FOCAL_KEY_STEP) * 100) / 100),
    y: unit(Math.round((from.y + move[1] * FOCAL_KEY_STEP) * 100) / 100),
  };
}

/** « 30 % depuis la gauche, 70 % depuis le haut » — la position dite au lecteur d'écran. */
export function focalLabel(focal: ImageFocal | undefined): string {
  const point = focal ?? DEFAULT_IMAGE_FOCAL;
  return `${percent(point.x)} depuis la gauche, ${percent(point.y)} depuis le haut`;
}

/** Le recadrage CSS d'une image de l'aperçu. */
export interface ImageFramingStyle {
  readonly aspectRatio: string;
  readonly objectPosition: string;
}

/**
 * Le recadrage CSS que demandent les attributs `data-image-*` d'une image du
 * canevas ; `null` sans format qui recadre. Un point focal illisible retombe
 * au centre — le refus, lui, est dit sous le bloc.
 */
export function imageFramingStyle(
  format: string | null,
  focalX: string | null,
  focalY: string | null,
): ImageFramingStyle | null {
  if (format === null || !isImageFormat(format) || format === 'original') {
    return null;
  }
  const x = fraction(focalX, DEFAULT_IMAGE_FOCAL.x);
  const y = fraction(focalY, DEFAULT_IMAGE_FOCAL.y);
  return {
    aspectRatio: String(IMAGE_FORMAT_RATIOS[format]),
    objectPosition: `${String(x * 100)}% ${String(y * 100)}%`,
  };
}

function fraction(raw: string | null, fallback: number): number {
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function percent(value: number): string {
  return `${String(Math.round(value * 100))} %`;
}

function unit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

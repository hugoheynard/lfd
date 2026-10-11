import type { FocalPoint } from '@lfd/pim-contracts';

import type { ImageDescription } from './image-description';

/**
 * **Pointer et parcourir** dans le panneau d'une image : le point focal sous
 * le clic, les touches, les voisines. Pur — la boîte et la cible arrivent en
 * paramètre.
 */

/** Le rectangle où l'on pointe, tel que `getBoundingClientRect` le rend. */
export interface PointingBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Le point focal là où l'on clique, en **fractions** de l'image, bornées à
 * `[0, 1]`.
 *
 * Jamais en pixels : l'image est recadrée à des tailles qu'on ne connaît pas.
 * La cible épouse l'image (pas de bandes autour), sans quoi un clic dans la
 * marge donnerait une fraction fausse. `null` sur une cible sans surface.
 */
export function focalAt(clientX: number, clientY: number, box: PointingBox): FocalPoint | null {
  if (box.width === 0 || box.height === 0) {
    return null;
  }
  return {
    x: unit((clientX - box.left) / box.width),
    y: unit((clientY - box.top) / box.height),
  };
}

/** Les voisines d'une image dans une suite — `null` aux bords, ou hors de la suite. */
export function neighboursOf(
  images: readonly ImageDescription[],
  url: string | null,
): { readonly previous: ImageDescription | null; readonly next: ImageDescription | null } {
  const at = images.findIndex((image) => image.url === url);
  return at < 0
    ? { previous: null, next: null }
    : { previous: images[at - 1] ?? null, next: images[at + 1] ?? null };
}

/**
 * Ce qu'une touche demande au panneau. Échap annule, partout ; les flèches
 * passent à l'image voisine, sauf dans un champ, où elles déplacent le curseur.
 */
export function keyIntent(
  key: string,
  target: EventTarget | null,
): 'cancel' | 'previous' | 'next' | null {
  if (key === 'Escape') {
    return 'cancel';
  }
  if ((key !== 'ArrowLeft' && key !== 'ArrowRight') || isEditable(target)) {
    return null;
  }
  return key === 'ArrowLeft' ? 'previous' : 'next';
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select') !== null)
  );
}

/** « 30 % » — une fraction du point focal, arrondie au pour cent. */
export function percentLabel(value: number): string {
  return `${String(Math.round(value * 100))} %`;
}

function unit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

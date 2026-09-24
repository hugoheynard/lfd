/**
 * Un contenu ou plusieurs, et la séquence du défilement simulé
 * (`boutique-rayon-layout.md`, « Un contenu ou plusieurs »). Fonctions pures,
 * sans dépendance.
 */

import type { PlacedBlock } from "./grid.js";

/** Un contenu, ou plusieurs qui défilent à la même place. */
export type ContentsMode = "single" | "multiple";
export const CAROUSEL_NAVS = ["dots", "arrows", "both"] as const;
export type CarouselNav = (typeof CAROUSEL_NAVS)[number];

export interface CarouselSettings {
  readonly nav: CarouselNav;
  readonly autoplay: boolean;
  /** Durée d'affichage de chaque contenu, en secondes. */
  readonly intervalSeconds: number;
  /** Durée du PREMIER, plus longue : le temps de lire avant que la page ne bouge. */
  readonly firstSeconds: number;
  /** Nombre de contenus SIMULÉ, pour l'aperçu seulement : le vrai viendra du mapping. */
  readonly sampleCount: number;
}

export const INTERVAL_SECONDS = { min: 3, max: 15 } as const;
export const FIRST_SECONDS = { min: 3, max: 30 } as const;
export const SAMPLE_COUNT = { min: 2, max: 6 } as const;

export const DEFAULT_CAROUSEL: CarouselSettings = {
  nav: "dots",
  autoplay: false,
  intervalSeconds: 5,
  firstSeconds: 8,
  sampleCount: 3,
};

export function contentsOf(block: PlacedBlock): ContentsMode {
  return block.contents ?? "single";
}

export function carouselOf(block: PlacedBlock): CarouselSettings {
  return block.carousel ?? DEFAULT_CAROUSEL;
}

/** Le défilement EN VIGUEUR : `null` pour un seul contenu, même si des réglages sont gardés. */
export function activeCarousel(block: PlacedBlock): CarouselSettings | null {
  return contentsOf(block) === "multiple" ? carouselOf(block) : null;
}

/** Bascule un / plusieurs, sans jamais perdre les réglages du défilement. */
export function setContents<B extends PlacedBlock>(
  blocks: readonly B[],
  id: string,
  contents: ContentsMode,
): readonly B[] {
  return blocks.map((block) => (block.id === id ? { ...block, contents } : block));
}

function withinBounds(
  value: number,
  bounds: { readonly min: number; readonly max: number },
): boolean {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

export type CarouselResult<B extends PlacedBlock = PlacedBlock> =
  | { readonly ok: true; readonly blocks: readonly B[] }
  | {
      readonly ok: false;
      readonly field: "intervalSeconds" | "firstSeconds" | "sampleCount";
      readonly message: string;
    };

/** Règle le défilement ; une durée hors bornes (ou non entière) est refusée, en le disant. */
export function setCarousel<B extends PlacedBlock>(
  blocks: readonly B[],
  id: string,
  patch: Partial<CarouselSettings>,
): CarouselResult<B> {
  if (
    patch.intervalSeconds !== undefined &&
    !withinBounds(patch.intervalSeconds, INTERVAL_SECONDS)
  ) {
    return {
      ok: false,
      field: "intervalSeconds",
      message: `Chaque contenu s’affiche de ${INTERVAL_SECONDS.min} à ${INTERVAL_SECONDS.max} secondes, en secondes entières.`,
    };
  }
  if (patch.firstSeconds !== undefined && !withinBounds(patch.firstSeconds, FIRST_SECONDS)) {
    return {
      ok: false,
      field: "firstSeconds",
      message: `Le premier contenu s’affiche de ${FIRST_SECONDS.min} à ${FIRST_SECONDS.max} secondes, en secondes entières.`,
    };
  }
  if (patch.sampleCount !== undefined && !withinBounds(patch.sampleCount, SAMPLE_COUNT)) {
    return {
      ok: false,
      field: "sampleCount",
      message: `L’aperçu simule de ${SAMPLE_COUNT.min} à ${SAMPLE_COUNT.max} contenus.`,
    };
  }
  return {
    ok: true,
    blocks: blocks.map((block) =>
      block.id === id ? { ...block, carousel: { ...carouselOf(block), ...patch } } : block,
    ),
  };
}

/** « auto · 8 s puis 5 s » — le repère de la maquette ; `null` sans défilement automatique. */
export function autoplayLabel(block: PlacedBlock): string | null {
  const carousel = activeCarousel(block);
  return carousel === null || !carousel.autoplay
    ? null
    : `auto · ${carousel.firstSeconds} s puis ${carousel.intervalSeconds} s`;
}

/**
 * Le contenu affiché (0-indexé) après `elapsedMs` de défilement : le premier
 * reste `firstSeconds`, chacun des suivants `intervalSeconds`, puis le cycle
 * reprend au premier — qui retrouve sa durée plus longue. Temps injecté : la
 * maquette fournit le sien, les tests aussi.
 */
export function slideAt(elapsedMs: number, carousel: CarouselSettings): number {
  const firstMs = carousel.firstSeconds * 1000;
  const intervalMs = carousel.intervalSeconds * 1000;
  const cycleMs = firstMs + (carousel.sampleCount - 1) * intervalMs;
  const inCycle = ((elapsedMs % cycleMs) + cycleMs) % cycleMs;
  return inCycle < firstMs ? 0 : 1 + Math.floor((inCycle - firstMs) / intervalMs);
}

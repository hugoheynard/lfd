import type { ImagePalette, PaletteSwatch } from '@lfd/pim-contracts';

import { deltaE76, rgbToHex, rgbToLab, type Lab } from './color-math';

/**
 * **La palette d'une image, tirée de ses pixels** (`mediatheque.md` §9 bis).
 *
 * L'API n'a aucun décodeur d'image : le canvas lit les pixels
 * (`palette-reader.ts`), et ce fichier en tire les couleurs. Tout y est
 * PUR — des pixels RGBA en entrée, une palette en sortie, aucun hasard non
 * semé — pour qu'une même image rende toujours la même palette, et qu'on
 * l'éprouve sans navigateur.
 *
 * - les **dominantes** : k-means en Lab, k = 5, graine fixe ;
 * - les **écarts** : un découpage plus fin, dont on ne garde que les
 *   grappes à ΔE76 > 25 de toute dominante et couvrant au moins 1 % de
 *   l'image — assez loin pour être une autre couleur, assez présentes pour ne
 *   pas être du bruit. Au plus trois.
 */

/** Le nombre de dominantes. */
export const DOMINANT_COUNT = 5;
/** Le découpage fin dans lequel on cherche les écarts. */
export const FINE_COUNT = 16;
/** La distance minimale d'un écart à toute dominante. */
export const OUTLIER_MIN_DELTA_E = 25;
/** La part minimale d'un écart. */
export const OUTLIER_MIN_SHARE = 0.01;
/** Au plus trois écarts. */
export const OUTLIER_MAX = 3;
/** Un pixel plus transparent que ça n'est pas une couleur de l'image. */
const OPAQUE_ALPHA = 128;
/** La graine des tirages : fixe, pour qu'une image rende toujours la même palette. */
const SEED = 0x1f2e3d4c;
const MAX_ITERATIONS = 24;
/**
 * Plusieurs départs, chacun semé, et l'on garde le plus serré : un seul
 * départ peut laisser une couleur rare en dominante et fondre deux larges.
 */
const RESTARTS = 4;
/** Les parts sont arrondies à quatre décimales : la somme reste dans la tolérance du serveur. */
const SHARE_PRECISION = 10_000;

interface Sample {
  readonly lab: Lab;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface Cluster {
  readonly center: Lab;
  readonly count: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Un générateur à graine (mulberry32) : le seul hasard admis, rejouable. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Les pixels opaques ; les transparents ne sont pas une couleur de l'image. */
function samplesOf(pixels: Uint8ClampedArray): Sample[] {
  const samples: Sample[] = [];
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    if ((pixels[offset + 3] ?? 0) < OPAQUE_ALPHA) {
      continue;
    }
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    samples.push({ lab: rgbToLab(r, g, b), r, g, b });
  }
  return samples;
}

function distinctCount(samples: readonly Sample[], cap: number): number {
  const seen = new Set<number>();
  for (const sample of samples) {
    seen.add((sample.r << 16) | (sample.g << 8) | sample.b);
    if (seen.size >= cap) {
      break;
    }
  }
  return seen.size;
}

/** Départ k-means++, tiré par la graine : des centres écartés, toujours les mêmes. */
function initialCenters(samples: readonly Sample[], k: number, seed: number): Lab[] {
  const random = seeded(seed);
  const first = samples[Math.floor(random() * samples.length)] ?? samples[0];
  const centers: Lab[] = first === undefined ? [] : [first.lab];
  while (centers.length < k) {
    const weights = samples.map((sample) =>
      Math.min(...centers.map((center) => deltaE76(sample.lab, center) ** 2)),
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total === 0) {
      break;
    }
    let target = random() * total;
    let chosen = samples.length - 1;
    for (const [index, weight] of weights.entries()) {
      target -= weight;
      if (target <= 0) {
        chosen = index;
        break;
      }
    }
    const picked = samples[chosen];
    if (picked !== undefined) {
      centers.push(picked.lab);
    }
  }
  return centers;
}

function nearest(lab: Lab, centers: readonly Lab[]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, center] of centers.entries()) {
    const distance = deltaE76(lab, center);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** k-means en Lab, le meilleur de {@link RESTARTS} départs ; la plus grosse grappe d'abord. */
function kMeans(samples: readonly Sample[], wanted: number): readonly Cluster[] {
  const k = Math.min(wanted, distinctCount(samples, wanted));
  if (k === 0) {
    return [];
  }
  let best: { clusters: readonly Cluster[]; inertia: number } | null = null;
  for (let restart = 0; restart < RESTARTS; restart += 1) {
    const run = lloyd(samples, initialCenters(samples, k, SEED + restart));
    if (best === null || run.inertia < best.inertia) {
      best = run;
    }
  }
  return best?.clusters ?? [];
}

function lloyd(
  samples: readonly Sample[],
  start: Lab[],
): { clusters: readonly Cluster[]; inertia: number } {
  let centers = start;
  let assignment = samples.map((sample) => nearest(sample.lab, centers));
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    centers = centers.map((center, index) => {
      const members = samples.filter((_, position) => assignment[position] === index);
      return members.length === 0 ? center : meanLab(members);
    });
    const next = samples.map((sample) => nearest(sample.lab, centers));
    const stable = next.every((value, position) => value === assignment[position]);
    assignment = next;
    if (stable) {
      break;
    }
  }
  const inertia = samples.reduce((sum, sample, position) => {
    const center = centers[assignment[position] ?? 0];
    return center === undefined ? sum : sum + deltaE76(sample.lab, center) ** 2;
  }, 0);
  const clusters = centers
    .map((center, index) => {
      const members = samples.filter((_, position) => assignment[position] === index);
      return {
        center,
        count: members.length,
        r: average(members.map((member) => member.r)),
        g: average(members.map((member) => member.g)),
        b: average(members.map((member) => member.b)),
      };
    })
    .filter((cluster) => cluster.count > 0)
    .sort((first, second) => second.count - first.count);
  return { clusters, inertia };
}

function meanLab(members: readonly Sample[]): Lab {
  return {
    l: average(members.map((member) => member.lab.l)),
    a: average(members.map((member) => member.lab.a)),
    b: average(members.map((member) => member.lab.b)),
  };
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundShare(share: number): number {
  return Math.round(share * SHARE_PRECISION) / SHARE_PRECISION;
}

/**
 * La palette de pixels RGBA (`ImageData.data`).
 *
 * @returns `null` quand aucun pixel n'est opaque — une image entièrement
 *   transparente n'a pas de couleur à dire.
 */
export function extractPalette(pixels: Uint8ClampedArray): ImagePalette | null {
  const samples = samplesOf(pixels);
  if (samples.length === 0) {
    return null;
  }
  const dominants = kMeans(samples, DOMINANT_COUNT);
  const dominantSwatches: PaletteSwatch[] = dominants.map((cluster) => ({
    hex: rgbToHex(cluster.r, cluster.g, cluster.b),
    share: roundShare(cluster.count / samples.length),
    outlier: false,
  }));
  const outliers: PaletteSwatch[] = kMeans(samples, FINE_COUNT)
    .filter(
      (cluster) =>
        cluster.count / samples.length >= OUTLIER_MIN_SHARE &&
        dominants.every(
          (dominant) => deltaE76(cluster.center, dominant.center) > OUTLIER_MIN_DELTA_E,
        ),
    )
    .slice(0, OUTLIER_MAX)
    .map((cluster) => ({
      hex: rgbToHex(cluster.r, cluster.g, cluster.b),
      share: roundShare(cluster.count / samples.length),
      outlier: true,
    }));
  return [...dominantSwatches, ...outliers];
}

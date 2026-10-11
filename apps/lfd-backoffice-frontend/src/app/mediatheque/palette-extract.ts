import { InjectionToken } from '@angular/core';
import type { ImagePalette, PaletteSwatch } from '@lfd/pim-contracts';

/**
 * **La palette d'une image, calculée dans le navigateur** (plan L9, R28).
 *
 * L'API n'a aucun décodeur d'image : c'est le canvas qui lit les pixels, et ce
 * fichier qui en tire les couleurs. Les fonctions de calcul sont PURES — des
 * pixels RGBA en entrée, une palette en sortie, aucun hasard non semé — pour
 * qu'une même image rende toujours la même palette, et qu'on l'éprouve sans
 * navigateur.
 *
 * - les **dominantes** : k-means en Lab, k = 5, graine fixe ;
 * - les **écarts** (R29) : un découpage plus fin, dont on ne garde que les
 *   grappes à ΔE76 > 25 de toute dominante et couvrant au moins 1 % de
 *   l'image — assez loin pour être une autre couleur, assez présentes pour ne
 *   pas être du bruit. Au plus trois.
 */

/** Le nombre de dominantes (plan L9). */
export const DOMINANT_COUNT = 5;
/** Le découpage fin dans lequel on cherche les écarts. */
export const FINE_COUNT = 16;
/** R29 : distance minimale d'un écart à toute dominante. */
export const OUTLIER_MIN_DELTA_E = 25;
/** R29 : part minimale d'un écart. */
export const OUTLIER_MIN_SHARE = 0.01;
/** R29 : au plus trois écarts. */
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
/** Le côté de la miniature lue par le canvas (plan L9). */
export const SAMPLE_SIDE = 64;

/** Une couleur en Lab (D65). */
export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

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

const LINEAR = Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});

const WHITE_X = 0.95047;
const WHITE_Z = 1.08883;

function labPivot(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

/** sRGB 0-255 → Lab, blanc D65. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = LINEAR[r] ?? 0;
  const lg = LINEAR[g] ?? 0;
  const lb = LINEAR[b] ?? 0;
  const x = labPivot((lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / WHITE_X);
  const y = labPivot(lr * 0.2126 + lg * 0.7152 + lb * 0.0722);
  const z = labPivot((lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / WHITE_Z);
  return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

/** `#rrggbb` → Lab. */
export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

/** `#rrggbb` → [r, g, b]. */
export function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** [r, g, b] → `#rrggbb`, en minuscules — la forme que le domaine range. */
export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** ΔE76 : la distance euclidienne en Lab. */
export function deltaE76(first: Lab, second: Lab): number {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
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

/**
 * La palette d'une image du navigateur — un fichier choisi, ou une adresse.
 *
 * Miniature de {@link SAMPLE_SIDE} px sur un canvas, puis {@link extractPalette}.
 * 🔴 Rend `null` sur TOUT échec — décodeur absent, image illisible, canvas
 * « contaminé » par une adresse servie sans CORS : la palette est cosmétique,
 * elle ne bloque jamais un dépôt ni un affichage.
 */
export async function readPalette(source: Blob | string): Promise<ImagePalette | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  try {
    const image = typeof source === 'string' ? await loadUrl(source) : await loadBlob(source);
    if (image === null) {
      return null;
    }
    const scale = SAMPLE_SIDE / Math.max(image.width, image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      return null;
    }
    context.drawImage(image.drawable, 0, 0, width, height);
    // Lève une SecurityError si l'adresse n'a pas autorisé la lecture (CORS).
    return extractPalette(context.getImageData(0, 0, width, height).data);
  } catch {
    return null;
  }
}

interface Decoded {
  readonly drawable: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

async function loadBlob(blob: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap !== 'function') {
    return null;
  }
  const bitmap = await createImageBitmap(blob);
  return { drawable: bitmap, width: bitmap.width, height: bitmap.height };
}

async function loadUrl(url: string): Promise<Decoded | null> {
  if (typeof Image !== 'function') {
    return null;
  }
  const image = new Image();
  // Anonyme : le stockage sert les images avec CORS ; sans lui, le canvas
  // serait contaminé et `getImageData` lèverait.
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return { drawable: image, width: image.naturalWidth, height: image.naturalHeight };
}

/** Ce qui lit la palette d'une image — remplacé en test, où il n'y a pas de canvas. */
export type PaletteReader = (source: Blob | string) => Promise<ImagePalette | null>;

/** Le lecteur de palette ; le canvas du navigateur par défaut. */
export const PALETTE_READER = new InjectionToken<PaletteReader>('PALETTE_READER', {
  providedIn: 'root',
  factory: () => readPalette,
});

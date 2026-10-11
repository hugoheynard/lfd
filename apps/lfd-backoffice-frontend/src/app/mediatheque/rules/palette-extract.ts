import type { ImagePalette, PaletteSwatch } from '@lfd/pim-contracts';

import { deltaE76, rgbToHex, rgbToLab } from './color-math';
import { kMeans, type Sample } from './k-means';

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
const OPAQUE_ALPHA = 128; /** Les parts sont arrondies à quatre décimales : la somme reste dans la tolérance du serveur. */
const SHARE_PRECISION = 10_000;
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

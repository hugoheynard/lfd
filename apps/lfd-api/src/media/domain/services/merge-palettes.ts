import type { PaletteSwatch } from "../value-objects/image-palette.js";
import { deltaE76, hexOf, labOf, type LabColor } from "./lab-color.js";

/** En deçà de ce ΔE76, deux couleurs de photos différentes n'en font qu'une. */
export const MERGE_DELTA_E = 12;
/** Les dominantes qu'une colonne garde. */
export const MERGED_DOMINANTS = 5;
/** Les écarts qu'une colonne garde — les plus fréquents. */
export const MERGED_OUTLIERS = 3;

interface Cluster {
  lab: LabColor;
  /** La masse : somme des poids, sert à la moyenne et au classement des dominantes. */
  weight: number;
  /** Combien de couleurs y sont tombées : classe les écarts. */
  hits: number;
}

/**
 * **La palette d'une tranche de photos** — fonction pure (L9, 2026-10-11).
 *
 * - Dominantes : chacune pèse `share × 1/n` (n = images peintes), regroupées
 *   par proximité (ΔE76 < {@link MERGE_DELTA_E}, moyenne Lab pondérée) ; on
 *   garde les {@link MERGED_DOMINANTS} plus lourdes, renormalisées à 1.
 * - Écarts : leur union, regroupée de même ; on garde les
 *   {@link MERGED_OUTLIERS} plus FRÉQUENTS, `outlier: true`, part moyenne.
 *
 * Le résultat respecte le contrat d'une palette d'image (≤ 8 entrées,
 * dominantes sommant à 1) — sauf sans aucune image peinte : `[]`.
 */
export function mergePalettes(palettes: readonly (readonly PaletteSwatch[])[]): PaletteSwatch[] {
  if (palettes.length === 0) {
    return [];
  }
  const perImage = 1 / palettes.length;
  const all = palettes.flat();
  const dominants = clusterOf(
    all.filter((swatch) => !swatch.outlier),
    perImage,
  )
    .sort((left, right) => right.weight - left.weight)
    .slice(0, MERGED_DOMINANTS);
  const mass = dominants.reduce((sum, cluster) => sum + cluster.weight, 0);
  const outliers = clusterOf(
    all.filter((swatch) => swatch.outlier),
    perImage,
  )
    .sort((left, right) => right.hits - left.hits || right.weight - left.weight)
    .slice(0, MERGED_OUTLIERS);
  return [
    ...dominants.map((cluster) => swatchOf(cluster, mass === 0 ? 0 : cluster.weight / mass, false)),
    ...outliers.map((cluster) => swatchOf(cluster, Math.min(cluster.weight, 1), true)),
  ];
}

/**
 * Regroupe glouton, de la plus lourde à la plus légère : une couleur rejoint
 * le groupe le plus proche s'il est à moins du seuil, sinon en ouvre un.
 * L'ordre de départ est fixé (poids, puis hex) : même entrée, même frise.
 */
function clusterOf(swatches: readonly PaletteSwatch[], perImage: number): Cluster[] {
  const sorted = [...swatches].sort(
    (left, right) => right.share - left.share || (left.hex < right.hex ? -1 : 1),
  );
  const clusters: Cluster[] = [];
  for (const swatch of sorted) {
    const lab = labOf(swatch.hex);
    const weight = swatch.share * perImage;
    const nearest = nearestOf(clusters, lab);
    if (nearest === undefined) {
      clusters.push({ lab, weight, hits: 1 });
    } else {
      absorb(nearest, lab, weight);
    }
  }
  return clusters;
}

function nearestOf(clusters: readonly Cluster[], lab: LabColor): Cluster | undefined {
  let best: Cluster | undefined;
  let bestDistance = MERGE_DELTA_E;
  for (const cluster of clusters) {
    const distance = deltaE76(cluster.lab, lab);
    if (distance < bestDistance) {
      best = cluster;
      bestDistance = distance;
    }
  }
  return best;
}

function absorb(cluster: Cluster, lab: LabColor, weight: number): void {
  const total = cluster.weight + weight;
  // Deux couleurs de part nulle : moyenne simple plutôt qu'une division par zéro.
  const ratio = total === 0 ? 1 / (cluster.hits + 1) : weight / total;
  cluster.lab = {
    l: cluster.lab.l + (lab.l - cluster.lab.l) * ratio,
    a: cluster.lab.a + (lab.a - cluster.lab.a) * ratio,
    b: cluster.lab.b + (lab.b - cluster.lab.b) * ratio,
  };
  cluster.weight = total;
  cluster.hits += 1;
}

function swatchOf(cluster: Cluster, share: number, outlier: boolean): PaletteSwatch {
  return { hex: hexOf(cluster.lab), share, outlier };
}

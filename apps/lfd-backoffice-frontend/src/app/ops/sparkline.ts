import type { TrafficSample } from '@lfd/ops-contract';

/**
 * **La courbe d'un nœud**, réduite à deux tracés SVG.
 *
 * Elle répond à une question et une seule : *est-ce pire que tout à l'heure ?*
 * Pas d'axes, pas de graduations, pas d'étiquettes — une vignette qui demande à
 * être déchiffrée n'est plus une vignette, c'est un graphique, et un graphique
 * se remet à plus tard.
 *
 * Deux tracés parce que deux faits distincts : le **volume** (l'aire, calme) et
 * les **échecs** (le trait, qui n'apparaît que s'il y en a). Superposer les deux
 * sur une même échelle rendrait les échecs invisibles — ils sont, par
 * construction, deux ordres de grandeur sous le volume. Les échecs ont donc
 * leur PROPRE échelle, et c'est assumé : on cherche une bosse, pas une valeur.
 */
export interface Sparkline {
  /** L'aire du volume, fermée sur la ligne de base. */
  readonly area: string;
  /** Le trait des échecs, ou `null` quand la période n'en compte aucun. */
  readonly failures: string | null;
  /** Le dernier point du volume — celui qu'on souligne, parce que c'est « maintenant ». */
  readonly tip: { readonly x: number; readonly y: number };
}

/**
 * Construit la vignette dans une boîte de `width` × `height`.
 *
 * Rend `null` sous **deux** points : une courbe d'un seul point n'est pas une
 * courbe, c'est un point — et le dessiner suggérerait une histoire là où il n'y
 * a qu'une mesure.
 */
export function sparklineOf(
  points: readonly TrafficSample[],
  width: number,
  height: number,
): Sparkline | null {
  if (points.length < 2) {
    return null;
  }
  const peak = Math.max(...points.map((point) => point.requests), 1);
  const step = width / (points.length - 1);
  const y = (value: number, scale: number): number => height - (value / scale) * height;

  const volume = points.map((point, index) => ({
    x: index * step,
    y: y(point.requests, peak),
  }));
  const last = volume[volume.length - 1] ?? { x: width, y: height };

  return {
    area: `M 0 ${height} ${volume.map((at) => `L ${round(at.x)} ${round(at.y)}`).join(' ')} L ${round(width)} ${height} Z`,
    failures: failureLine(points, step, height),
    tip: { x: round(last.x), y: round(last.y) },
  };
}

/** Le trait des échecs, sur sa propre échelle — absent quand il n'y en a aucun. */
function failureLine(
  points: readonly TrafficSample[],
  step: number,
  height: number,
): string | null {
  const worst = Math.max(...points.map((point) => point.failures));
  if (worst <= 0) {
    return null;
  }
  const path = points
    .map((point, index) => {
      const x = round(index * step);
      const at = round(height - (point.failures / worst) * height);
      return `${index === 0 ? 'M' : 'L'} ${x} ${at}`;
    })
    .join(' ');
  return path;
}

/** Deux décimales suffisent : au-delà, on alourdit le DOM pour du sous-pixel. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

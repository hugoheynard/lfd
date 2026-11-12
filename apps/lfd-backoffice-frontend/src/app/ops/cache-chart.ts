/**
 * **Une courbe horaire sur une période**, réduite à un tracé SVG.
 *
 * L'abscisse est le TEMPS, pas le rang du point : une série ne porte que les
 * heures qui ont compté quelque chose, et des points posés à pas régulier
 * feraient d'une nuit muette un raccourci invisible.
 *
 * Une valeur `null` (aucune lecture dans l'heure) coupe le trait : relier deux
 * mesures par-dessus un trou inventerait celles qui manquent.
 */
export interface ChartPoint {
  /** L'instant, ISO. */
  readonly at: string;
  readonly value: number | null;
}

export interface ChartLine {
  /** Le tracé, en un ou plusieurs segments (`M … L …`). */
  readonly path: string;
  /** La plus forte valeur de la série — l'échelle, à dire à côté de la courbe. */
  readonly peak: number;
}

/**
 * Trace `points` entre `from` et `to` dans une boîte `width` × `height`.
 * `ceiling` fixe le haut de l'échelle (1 pour un taux) ; sans lui, c'est le pic.
 * Rend `null` sans aucune valeur mesurée.
 */
export function chartLineOf(
  points: readonly ChartPoint[],
  window: { readonly from: number; readonly to: number },
  box: { readonly width: number; readonly height: number },
  ceiling?: number,
): ChartLine | null {
  const measured = points.filter((point) => point.value !== null);
  if (measured.length === 0) {
    return null;
  }
  const peak = Math.max(...measured.map((point) => point.value ?? 0));
  const top = ceiling ?? Math.max(peak, 1);
  const span = Math.max(window.to - window.from, 1);
  const x = (at: string): number => round(((Date.parse(at) - window.from) / span) * box.width);
  const y = (value: number): number => round(box.height - (value / top) * box.height);

  let path = '';
  let open = false;
  for (const point of points) {
    if (point.value === null) {
      open = false;
      continue;
    }
    path += `${path === '' ? '' : ' '}${open ? 'L' : 'M'} ${x(point.at)} ${y(point.value)}`;
    open = true;
  }
  return { path, peak };
}

/** Une taille en octets, lisible : « 1,2 Mo ». */
export function bytesLabel(bytes: number | null): string {
  if (bytes === null) {
    return '—';
  }
  const units = ['o', 'ko', 'Mo', 'Go'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits })} ${units[unit]}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

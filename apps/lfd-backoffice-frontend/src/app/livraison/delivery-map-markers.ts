import type { GpsPoint } from '@lfd/contracts';
import type { LngLatBounds } from 'maplibre-gl';

import { type PlannedRound, stopPointOf } from './delivery-planning';

/**
 * **Les repères de la carte « Planifier » et le cadre qui les contient** —
 * sortis du composant `DeliveryMap`. Les repères sont des éléments HTML que
 * MapLibre place lui-même ; leurs classes sont préfixées `delivery-map`, et
 * leur style vit dans la feuille du composant (`ViewEncapsulation.None`).
 *
 * Type-only sur `maplibre-gl` : la bibliothèque, chargée à la demande, est
 * passée en argument.
 */

/** Un repère : sa classe, son texte, et l'infobulle quand il y en a une. */
export function markerElement(
  document: Document,
  className: string,
  text: string,
  title: string,
): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  if (title !== '') {
    element.title = title;
  }
  return element;
}

/** La classe d'un repère d'arrêt : en retard sur sa fenêtre, estompé avec sa tournée. */
export function stopPinClass(windowMissed: boolean, muted: boolean): string {
  return [
    'delivery-map__pin',
    windowMissed ? 'delivery-map__pin--late' : '',
    muted ? 'delivery-map__pin--muted' : '',
  ]
    .filter((name) => name !== '')
    .join(' ');
}

/**
 * Le cadre qui couvre le départ, les tracés et les arrêts placés.
 *
 * `library` ne demande que le constructeur du cadre : le module chargé à la
 * demande (`import('maplibre-gl')`) et le type d'espace de noms ne se
 * reconnaissent pas l'un l'autre au build de production (constaté le 2026-10-07).
 */
export function roundsBounds(
  library: { readonly LngLatBounds: typeof LngLatBounds },
  departure: GpsPoint,
  rounds: readonly PlannedRound[],
): LngLatBounds {
  const bounds = new library.LngLatBounds(
    [departure.lng, departure.lat],
    [departure.lng, departure.lat],
  );
  for (const round of rounds) {
    for (const [lng, lat] of round.geometry ?? []) {
      bounds.extend([lng, lat]);
    }
    for (const stop of round.stops) {
      const point = stopPointOf(stop);
      if (point !== null) {
        bounds.extend([point.lng, point.lat]);
      }
    }
  }
  return bounds;
}

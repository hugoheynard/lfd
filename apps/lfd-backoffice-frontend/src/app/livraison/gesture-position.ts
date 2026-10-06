import { Injectable, signal } from '@angular/core';
import type { GesturePositionFields } from '@lfd/contracts';

/**
 * Ce que le téléphone accorde à un relevé : court, parce que le livreur attend
 * devant la porte ; une position de moins de 30 s est encore la sienne.
 */
export const GESTURE_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8_000,
  maximumAge: 30_000,
};

/** La géolocalisation du navigateur, ou rien (navigateur sans, rendu serveur). */
export type GeolocationSource = Pick<Geolocation, 'getCurrentPosition'> | null;

function browserGeolocation(): GeolocationSource {
  return typeof navigator === 'undefined' ? null : (navigator.geolocation ?? null);
}

/**
 * **La position du téléphone AU GESTE** (`documentation/livraisons/gps-y-aller-et-position.md`,
 * YA-D4) — « Je suis arrivé », « Remis au client », « Déposé avec preuve »,
 * « Clore sans remise ». Un relevé ponctuel (`getCurrentPosition`), JAMAIS
 * `watchPosition` : rien n'est lu entre deux gestes.
 *
 * Elle ne bloque jamais un geste : un refus du navigateur, une absence de
 * signal ou un délai dépassé rendent `null`, le geste part sans elle, et
 * `unavailable` le dit à l'écran (« position indisponible »).
 */
@Injectable({ providedIn: 'root' })
export class GesturePositionReader {
  /** Le dernier geste est parti sans position. */
  readonly unavailable = signal(false);

  /** Remplaçable en test ; le navigateur sinon. */
  source: GeolocationSource = browserGeolocation();

  read(): Promise<GesturePositionFields | null> {
    const source = this.source;
    if (source === null) {
      return Promise.resolve(this.settle(null));
    }
    return new Promise((resolve) => {
      source.getCurrentPosition(
        ({ coords }) =>
          resolve(
            this.settle({
              positionLat: coords.latitude,
              positionLng: coords.longitude,
              positionAccuracyM: coords.accuracy,
            }),
          ),
        () => resolve(this.settle(null)),
        GESTURE_POSITION_OPTIONS,
      );
    });
  }

  private settle(position: GesturePositionFields | null): GesturePositionFields | null {
    this.unavailable.set(position === null);
    return position;
  }
}

/** Ajoute la position au formulaire d'un geste en multipart — rien sans elle. */
export function appendPosition(body: FormData, position: GesturePositionFields | null): void {
  if (position === null) {
    return;
  }
  for (const [name, value] of Object.entries(position)) {
    if (typeof value === 'number') {
      body.append(name, String(value));
    }
  }
}

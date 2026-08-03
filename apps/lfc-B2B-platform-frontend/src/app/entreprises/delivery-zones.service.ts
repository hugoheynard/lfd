import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DeliveryZoneView } from '@lfd/contracts';

import { AUTH_CONFIG } from '../auth/auth.config';

/** Longueur du plus long préfixe qui préfixe `codePostal`, ou -1. **Miroir local**
 *  de `longestMatchingPrefix` de `@lfd/contracts` (gardé type-only côté client). */
function longestPrefixLength(prefixes: readonly string[], codePostal: string): number {
  let best = -1;
  for (const prefix of prefixes) {
    if (codePostal.startsWith(prefix) && prefix.length > best) {
      best = prefix.length;
    }
  }
  return best;
}

/**
 * Zones de livraison côté **client** — lecture seule (route publique). Chargées
 * une fois, exposées en signal ; le checkout y cherche la zone du code postal de
 * l'adresse livrée pour afficher le frais avant de commander (le serveur reste
 * l'autorité sur le total). Échec réseau → liste vide (pas de frais affiché).
 */
@Injectable({ providedIn: 'root' })
export class DeliveryZonesService {
  private readonly http = inject(HttpClient);

  private readonly _zones = signal<readonly DeliveryZoneView[]>([]);

  /** Toutes les zones connues. */
  readonly zones = this._zones.asReadonly();

  /**
   * La zone couvrant `codePostal`, ou `null`. **Miroir exact** de la résolution
   * serveur (`resolveForPostalCode` + `longestMatchingPrefix`) : le préfixe le
   * plus long (le plus spécifique) gagne. Le serveur reste l'autorité ; ceci n'est
   * qu'un affichage.
   */
  resolveForPostalCode(codePostal: string): DeliveryZoneView | null {
    let best: DeliveryZoneView | null = null;
    let bestLength = -1;
    for (const zone of this._zones()) {
      const length = longestPrefixLength(zone.postalPrefixes, codePostal);
      if (length > bestLength) {
        best = zone;
        bestLength = length;
      }
    }
    return best;
  }

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this._zones.set(
        await firstValueFrom(
          this.http.get<readonly DeliveryZoneView[]>(`${AUTH_CONFIG.apiBaseUrl}/delivery-zones`),
        ),
      );
    } catch {
      // Zones injoignables : pas de frais affiché, l'app continue.
    }
  }
}

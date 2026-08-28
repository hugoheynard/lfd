import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DeliveryZoneView } from '@lfd/contracts';
import { resolveZoneForPostalCode } from '@lfd/b2b-ui/order';

import { AUTH_CONFIG } from '../../auth/auth.config';

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

  /** La zone couvrant `codePostal`, ou `null` — cf. `resolveZoneForPostalCode`. */
  resolveForPostalCode(codePostal: string): DeliveryZoneView | null {
    return resolveZoneForPostalCode(this._zones(), codePostal);
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

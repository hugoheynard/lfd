import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PickupAddressView } from '@lfd/contracts';

import { AUTH_CONFIG } from '../auth/auth.config';

/**
 * Points de retrait (laboratoires) côté **client** — lecture seule (route
 * publique). Chargés une fois, exposés en signal ; on n'en garde que le
 * **défaut**, celui présélectionné au checkout et affiché dans la section
 * adresses tant que la livraison à domicile n'existe pas. En cas d'échec réseau,
 * on garde `null` (défaut sûr : pas de point affiché plutôt qu'une erreur).
 */
@Injectable({ providedIn: 'root' })
export class PickupAddressesService {
  private readonly http = inject(HttpClient);

  private readonly _addresses = signal<readonly PickupAddressView[]>([]);

  /** Tous les points de retrait (lecture seule) — pour proposer un choix. */
  readonly addresses = this._addresses.asReadonly();

  /** Le point de retrait par défaut (renvoyé en tête par le backend), ou `null`. */
  readonly defaultPickup = computed<PickupAddressView | null>(
    () => this._addresses().find((a) => a.isDefault) ?? this._addresses()[0] ?? null,
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this._addresses.set(
        await firstValueFrom(
          this.http.get<readonly PickupAddressView[]>(
            `${AUTH_CONFIG.apiBaseUrl}/pickup-addresses`,
          ),
        ),
      );
    } catch {
      // Points injoignables : on n'empêche pas l'app de tourner.
    }
  }
}

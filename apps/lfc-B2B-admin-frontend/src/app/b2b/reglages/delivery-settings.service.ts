import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DeliverySettingsPatch, DeliverySettingsView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **À quelles clientèles la livraison est proposée** — un réglage unique, B2B
 * et B2C, posé dans « E-commerce LFC → Réglages → Livraison ».
 *
 * Le serveur rend une vue même quand personne n'a rien réglé : ouverte aux deux,
 * `updatedAt` et `updatedBy` à `null`. Il n'y a donc pas de « réglage absent »
 * à traiter ici. Cf. `documentation/b2b/plan-remise-et-livraison-par-clientele.md`, D4.
 */
@Injectable({ providedIn: 'root' })
export class DeliverySettingsService {
  private readonly http = inject(HttpClient);

  /** Le réglage courant. */
  read(): Promise<DeliverySettingsView> {
    return firstValueFrom(this.http.get<DeliverySettingsView>(this.url()));
  }

  /** Change une clientèle (ou les deux) et rend le réglage tel qu'enregistré. */
  update(patch: DeliverySettingsPatch): Promise<DeliverySettingsView> {
    return firstValueFrom(this.http.patch<DeliverySettingsView>(this.url(), patch));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/delivery-settings`;
  }
}

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

  /**
   * Change une clientèle (ou les deux). Ne rend RIEN : la route répond `204`,
   * comme toute écriture ici, et c'est à l'appelant de relire.
   *
   * 🔴 Elle était typée `DeliverySettingsView` jusqu'au 2026-09-15 : le corps vide
   * du `204` devenait le réglage, l'écran le recevait à `null` et se vidait au
   * premier clic sur une case.
   */
  update(patch: DeliverySettingsPatch): Promise<void> {
    return firstValueFrom(this.http.patch<void>(this.url(), patch));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/delivery-settings`;
  }
}

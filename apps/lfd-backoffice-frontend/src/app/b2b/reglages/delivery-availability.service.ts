import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  DeliveryAvailabilityPatch,
  DeliveryAvailabilityView,
  PublicDeliveryAvailabilityView,
} from '@lfd/contracts';

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
export class DeliveryAvailabilityService {
  private readonly http = inject(HttpClient);

  /** Le réglage courant. */
  read(): Promise<DeliveryAvailabilityView> {
    return firstValueFrom(this.http.get<DeliveryAvailabilityView>(this.url()));
  }

  /**
   * Change une clientèle (ou les deux). Ne rend RIEN : la route répond `204`,
   * comme toute écriture ici, et c'est à l'appelant de relire.
   *
   * 🔴 Elle était typée `DeliveryAvailabilityView` jusqu'au 2026-09-15 : le corps vide
   * du `204` devenait le réglage, l'écran le recevait à `null` et se vidait au
   * premier clic sur une case.
   */
  update(patch: DeliveryAvailabilityPatch): Promise<void> {
    return firstValueFrom(this.http.patch<void>(this.url(), patch));
  }

  /**
   * Le même réglage par la route **publique** — `{ openToB2b, openToB2c }`, sans
   * l'instant ni l'auteur, projeté dans la vue complète.
   *
   * Pour qui n'a pas `b2b_settings:read` : le comptoir consulte l'ouverture de
   * la livraison sans avoir à lire les réglages du commerce.
   */
  async readPublic(): Promise<DeliveryAvailabilityView> {
    const open = await firstValueFrom(
      this.http.get<PublicDeliveryAvailabilityView>(`${B2B_API_BASE}/delivery-availability`),
    );
    return {
      openToB2b: open.openToB2b,
      openToB2c: open.openToB2c,
      updatedAt: null,
      updatedBy: null,
    };
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/delivery-availability`;
  }
}

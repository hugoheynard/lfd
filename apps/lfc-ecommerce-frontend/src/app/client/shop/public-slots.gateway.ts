import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { PublicPickupSlot } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';

/**
 * **Les créneaux publics d'un point**, tels que le serveur les dérive.
 *
 * 🔴 Rien n'est calculé ici, et c'est délibéré. `publicPickupSlotsFor` existe
 * dans les contrats, mais elle vit dans un module qui importe zod : l'appeler
 * depuis la boutique ramènerait les schémas dans son bundle, dont le budget de
 * déploiement est déjà en avertissement. Surtout, un créneau « déjà commencé »
 * se juge contre l'horloge de la MAISON — ce dépôt a payé la leçon sur la
 * journée de service, que l'écran calculait depuis l'horloge du client.
 *
 * Le type, lui, entre en import de TYPE : aucun octet dans le bundle, et
 * l'écran ne peut pas diverger de ce que le serveur rend.
 *
 * Pas de cache : les créneaux dépendent de l'heure qu'il est. Garder ceux d'il
 * y a dix minutes ferait proposer une fournée qui vient de partir.
 */
@Injectable({ providedIn: 'root' })
export class PublicSlots {
  private readonly http = inject(HttpClient);

  /**
   * Les créneaux d'un point pour une journée, ou une liste **vide**.
   *
   * Une liste vide n'est pas une panne : c'est un point qui n'a pas publié de
   * créneaux ce jour-là, ou qui est fermé. L'écran le dit plutôt que de faire
   * semblant — et un échec réseau donne la même chose, faute de pouvoir
   * affirmer une heure qu'on n'a pas lue.
   */
  async forDay(pickupAddressId: string, day: string): Promise<readonly PublicPickupSlot[]> {
    // Chemin et paramètre en français : c'est le contrat de l'API, aligné sur
    // sa route sœur d'administration (`creneaux-publics`) et sur la file du
    // retrait (`jour`).
    const url = `${AUTH_CONFIG.apiBaseUrl}/pickup-addresses/${encodeURIComponent(pickupAddressId)}/creneaux`;
    try {
      return await firstValueFrom(
        this.http.get<readonly PublicPickupSlot[]>(url, { params: { jour: day } }),
      );
    } catch {
      return [];
    }
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedPickupResponse,
  PickupAddressPayload,
  PickupAddressUpdatePayload,
  PickupAddressView,
  PublicPickupSchedulePayload,
  PublicPickupScheduleView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Points de retrait (laboratoires) — adresses **globales** d'acheminement. La
 * **lecture** est publique (le checkout client comme l'admin en ont besoin) ;
 * l'**écriture** est staff (token pour l'audience admin, comme les autres
 * mutations). Invariants côté backend : un seul défaut, au moins un point gardé.
 */
@Injectable({ providedIn: 'root' })
export class PickupAddressesService {
  private readonly http = inject(HttpClient);

  /** Liste les points de retrait (le défaut en tête). Route publique. */
  list(): Promise<readonly PickupAddressView[]> {
    return firstValueFrom(
      this.http.get<readonly PickupAddressView[]>(`${B2B_API_BASE}/pickup-addresses`),
    );
  }

  /** Crée un point de retrait (staff). */
  async create(payload: PickupAddressPayload): Promise<CreatedPickupResponse> {
    return firstValueFrom(
      this.http.post<CreatedPickupResponse>(`${B2B_API_BASE}/admin/pickup-addresses`, payload),
    );
  }

  /**
   * Édite un point de retrait (staff). Les clientèles de la remise y sont
   * facultatives côté serveur (absentes = inchangées) ; l'écran les envoie
   * toujours, puisqu'il les montre.
   */
  async update(id: string, payload: PickupAddressUpdatePayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/pickup-addresses/${id}`, payload),
    );
  }

  /** Supprime un point de retrait (staff ; le backend refuse le dernier). */
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${B2B_API_BASE}/admin/pickup-addresses/${id}`));
  }

  /**
   * L'horaire **public** d'un point : ses plages de créneaux et ses fermetures.
   *
   * 🔴 Une surface à part, et non un champ de plus sur le point : les heures
   * **pro** (`opening`) ne passent pas par là et ce chantier n'y touche pas
   * (plan `documentation/b2b/plan-creneaux-de-retrait.md`, §3). Deux listes
   * vides = le point n'est pas réglé, et il se comporte alors exactement comme
   * avant (D6).
   */
  publicSchedule(id: string): Promise<PublicPickupScheduleView> {
    return firstValueFrom(
      this.http.get<PublicPickupScheduleView>(
        `${B2B_API_BASE}/admin/pickup-addresses/${id}/creneaux-publics`,
      ),
    );
  }

  /**
   * Enregistre l'horaire public **en bloc** (staff).
   *
   * `PUT` et non un CRUD à trois verbes : le refus de chevauchement se juge sur
   * l'ENSEMBLE des plages, pas sur celle qu'on vient de toucher. L'écran édite
   * donc une grille entière et l'envoie d'un geste — ce qui la rend aussi
   * idempotente au réessai.
   */
  async savePublicSchedule(id: string, payload: PublicPickupSchedulePayload): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/pickup-addresses/${id}/creneaux-publics`, payload),
    );
  }
}

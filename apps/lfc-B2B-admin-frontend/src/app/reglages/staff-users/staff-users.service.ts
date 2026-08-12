import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedStaffUserResponse,
  StaffStatusChange,
  StaffUserPayload,
  StaffUserView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Annuaire **staff** (back-office) — CRUD entièrement staff-gated (aucune surface
 * publique). Miroir de PickupAddressesService pour le token staff. Source de
 * vérité locale : pas d'Auth0 pour l'instant.
 */
@Injectable({ providedIn: 'root' })
export class StaffUsersService {
  private readonly http = inject(HttpClient);

  /** Liste les users staff (triés par nom). Staff-gated. */
  async list(): Promise<readonly StaffUserView[]> {
    return firstValueFrom(
      this.http.get<readonly StaffUserView[]>(`${B2B_API_BASE}/admin/staff-users`),
    );
  }

  /** Crée un user staff. */
  async create(payload: StaffUserPayload): Promise<CreatedStaffUserResponse> {
    return firstValueFrom(
      this.http.post<CreatedStaffUserResponse>(`${B2B_API_BASE}/admin/staff-users`, payload),
    );
  }

  /** Édite un user staff. */
  async update(id: string, payload: StaffUserPayload): Promise<void> {
    await firstValueFrom(this.http.patch<void>(`${B2B_API_BASE}/admin/staff-users/${id}`, payload));
  }

  /**
   * Suspend une personne, ou la réintègre. Geste distinct de l'édition : on ne
   * ferme pas un accès en enregistrant un formulaire de coordonnées.
   */
  async setStatus(id: string, change: StaffStatusChange): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/staff-users/${id}/status`, change),
    );
  }

  /** Supprime un user staff. */
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${B2B_API_BASE}/admin/staff-users/${id}`));
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedStaffUserResponse,
  StaffUserPayload,
  StaffUserView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

/** Audience du token staff (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Annuaire **staff** (back-office) — CRUD entièrement staff-gated (aucune surface
 * publique). Miroir de PickupAddressesService pour le token staff. Source de
 * vérité locale : pas d'Auth0 pour l'instant.
 */
@Injectable({ providedIn: 'root' })
export class StaffUsersService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  /** Liste les users staff (triés par nom). Staff-gated. */
  async list(): Promise<readonly StaffUserView[]> {
    return firstValueFrom(
      this.http.get<readonly StaffUserView[]>(
        `${B2B_API_BASE}/admin/staff-users`,
        await this.staffOptions(),
      ),
    );
  }

  /** Crée un user staff. */
  async create(payload: StaffUserPayload): Promise<CreatedStaffUserResponse> {
    return firstValueFrom(
      this.http.post<CreatedStaffUserResponse>(
        `${B2B_API_BASE}/admin/staff-users`,
        payload,
        await this.staffOptions(),
      ),
    );
  }

  /** Édite un user staff. */
  async update(id: string, payload: StaffUserPayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/staff-users/${id}`,
        payload,
        await this.staffOptions(),
      ),
    );
  }

  /** Supprime un user staff. */
  async remove(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/staff-users/${id}`, await this.staffOptions()),
    );
  }

  /** En-tête `Authorization` staff, ou vide si le token est indisponible. */
  private async staffOptions(): Promise<{ headers: Record<string, string> }> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    return { headers: token === null ? {} : { Authorization: `Bearer ${token}` } };
  }
}

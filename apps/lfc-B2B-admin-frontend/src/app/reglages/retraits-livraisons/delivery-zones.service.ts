import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedDeliveryZoneResponse,
  DeliveryZonePayload,
  DeliveryZoneView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

/** Audience du token staff (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Zones de livraison (code postal → frais). **Lecture** publique (le checkout
 * client en a besoin) ; **écriture** staff (token audience admin). Code postal
 * unique, tenu côté backend.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryZonesService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  /** Liste les zones (par code postal). Route publique. */
  list(): Promise<readonly DeliveryZoneView[]> {
    return firstValueFrom(
      this.http.get<readonly DeliveryZoneView[]>(`${B2B_API_BASE}/delivery-zones`),
    );
  }

  /** Crée une zone (staff). */
  async create(payload: DeliveryZonePayload): Promise<CreatedDeliveryZoneResponse> {
    return firstValueFrom(
      this.http.post<CreatedDeliveryZoneResponse>(
        `${B2B_API_BASE}/admin/delivery-zones`,
        payload,
        await this.staffOptions(),
      ),
    );
  }

  /** Édite une zone (staff). */
  async update(id: string, payload: DeliveryZonePayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/delivery-zones/${id}`,
        payload,
        await this.staffOptions(),
      ),
    );
  }

  /** Supprime une zone (staff). */
  async remove(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(
        `${B2B_API_BASE}/admin/delivery-zones/${id}`,
        await this.staffOptions(),
      ),
    );
  }

  /** En-tête `Authorization` staff, ou vide si le token est indisponible. */
  private async staffOptions(): Promise<{ headers: Record<string, string> }> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    return { headers: token === null ? {} : { Authorization: `Bearer ${token}` } };
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedPickupResponse,
  PickupAddressPayload,
  PickupAddressView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

/** Audience du token staff (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Points de retrait (laboratoires) — adresses **globales** d'acheminement. La
 * **lecture** est publique (le checkout client comme l'admin en ont besoin) ;
 * l'**écriture** est staff (token pour l'audience admin, comme les autres
 * mutations). Invariants côté backend : un seul défaut, au moins un point gardé.
 */
@Injectable({ providedIn: 'root' })
export class PickupAddressesService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  /** Liste les points de retrait (le défaut en tête). Route publique. */
  list(): Promise<readonly PickupAddressView[]> {
    return firstValueFrom(
      this.http.get<readonly PickupAddressView[]>(`${B2B_API_BASE}/pickup-addresses`),
    );
  }

  /** Crée un point de retrait (staff). */
  async create(payload: PickupAddressPayload): Promise<CreatedPickupResponse> {
    return firstValueFrom(
      this.http.post<CreatedPickupResponse>(
        `${B2B_API_BASE}/admin/pickup-addresses`,
        payload,
        await this.staffOptions(),
      ),
    );
  }

  /** Édite un point de retrait (staff). */
  async update(id: string, payload: PickupAddressPayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/pickup-addresses/${id}`,
        payload,
        await this.staffOptions(),
      ),
    );
  }

  /** Supprime un point de retrait (staff ; le backend refuse le dernier). */
  async remove(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(
        `${B2B_API_BASE}/admin/pickup-addresses/${id}`,
        await this.staffOptions(),
      ),
    );
  }

  /** Désigne un point comme défaut (staff). */
  async setDefault(id: string): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/pickup-addresses/${id}/default`,
        {},
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

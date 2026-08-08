import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  MarketAdoptionView,
  MarketConfigView,
  MarketSectorsView,
  MarketVolumeView,
  SectorRevenueView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

/** Audience du token staff (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Transport de la **config marché** (Réglages ▸ Commercial) et de l'**adoption par
 * territoire** (dashboard Croissance). Les mutations renvoient la config à jour (le
 * refresh renvoie les comptages figés). Auth staff identique au reste de l'admin.
 */
@Injectable({ providedIn: 'root' })
export class MarketService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);
  private readonly base = `${B2B_API_BASE}/admin/commercial/market`;

  config(): Promise<MarketConfigView> {
    return this.get<MarketConfigView>(this.base);
  }

  async addZone(codePostal: string): Promise<MarketConfigView> {
    return this.post<MarketConfigView>(`${this.base}/zones`, { codePostal });
  }

  async removeZone(codePostal: string): Promise<MarketConfigView> {
    return this.delete<MarketConfigView>(`${this.base}/zones/${encodeURIComponent(codePostal)}`);
  }

  async addNaf(code: string, label: string): Promise<MarketConfigView> {
    return this.post<MarketConfigView>(`${this.base}/naf`, { code, label });
  }

  async removeNaf(code: string): Promise<MarketConfigView> {
    return this.delete<MarketConfigView>(`${this.base}/naf/${encodeURIComponent(code)}`);
  }

  async refresh(): Promise<MarketConfigView> {
    return this.post<MarketConfigView>(`${this.base}/refresh`, {});
  }

  adoption(): Promise<MarketAdoptionView> {
    return this.get<MarketAdoptionView>(`${B2B_API_BASE}/admin/growth/adoption`);
  }

  sectors(): Promise<MarketSectorsView> {
    return this.get<MarketSectorsView>(`${B2B_API_BASE}/admin/growth/market-sectors`);
  }

  volume(): Promise<MarketVolumeView> {
    return this.get<MarketVolumeView>(`${B2B_API_BASE}/admin/growth/market-volume`);
  }

  sectorRevenue(): Promise<SectorRevenueView> {
    return this.get<SectorRevenueView>(`${B2B_API_BASE}/admin/growth/sector-revenue`);
  }

  private async get<T>(url: string): Promise<T> {
    const headers = await this.authHeaders();
    return firstValueFrom(this.http.get<T>(url, { headers }));
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const headers = await this.authHeaders();
    return firstValueFrom(this.http.post<T>(url, body, { headers }));
  }

  private async delete<T>(url: string): Promise<T> {
    const headers = await this.authHeaders();
    return firstValueFrom(this.http.delete<T>(url, { headers }));
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    return token === null ? {} : { Authorization: `Bearer ${token}` };
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ProductionCloseSettingsPayload, ProductionSettingsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const SETTINGS = `${B2B_API_BASE}/admin/production/settings`;

/**
 * **Les réglages du fournil** — l'arrêt du plan et les jours fermés (plan
 * `documentation/production/plan-arret-du-plan.md`, lot A1), sous
 * `production_settings`.
 *
 * Aucun état : l'écran relit après chaque écriture. Les refus remontent tels
 * quels — le 409 d'une heure d'arrêt trop tôt nomme l'heure limite.
 */
@Injectable({ providedIn: 'root' })
export class ProductionSettingsService {
  private readonly http = inject(HttpClient);

  settings(): Promise<ProductionSettingsView> {
    return firstValueFrom(this.http.get<ProductionSettingsView>(SETTINGS));
  }

  async changeClose(payload: ProductionCloseSettingsPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${SETTINGS}/close`, payload));
  }

  async addClosedDay(date: string): Promise<void> {
    await firstValueFrom(this.http.post(`${SETTINGS}/closed-days`, { date }));
  }

  async removeClosedDay(date: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${SETTINGS}/closed-days/${encodeURIComponent(date)}`));
  }
}

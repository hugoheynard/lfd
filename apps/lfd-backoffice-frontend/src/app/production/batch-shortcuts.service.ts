import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  BatchShortcutsSettingsView,
  CreateBatchShortcutPayload,
  CreatedIdResponse,
  UpdateBatchShortcutPayload,
  WorkshopShortcutsView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const SETTINGS = `${B2B_API_BASE}/admin/production/settings/shortcuts`;
const WORKSHOP = `${B2B_API_BASE}/admin/production/shortcuts`;

/**
 * **Les raccourcis du fournil** (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`) — la page de
 * réglage sous `production_settings`, et la lecture de la fiche d'atelier
 * sous `production_worksheet`.
 *
 * Aucun état : l'écran relit après chaque écriture. Les refus remontent tels
 * quels.
 */
@Injectable({ providedIn: 'root' })
export class BatchShortcutsService {
  private readonly http = inject(HttpClient);

  settings(): Promise<BatchShortcutsSettingsView> {
    return firstValueFrom(this.http.get<BatchShortcutsSettingsView>(SETTINGS));
  }

  async create(payload: CreateBatchShortcutPayload): Promise<string> {
    const created = await firstValueFrom(this.http.post<CreatedIdResponse>(SETTINGS, payload));
    return created.id;
  }

  async update(id: string, payload: UpdateBatchShortcutPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${SETTINGS}/${encodeURIComponent(id)}`, payload));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${SETTINGS}/${encodeURIComponent(id)}/remove`, {}));
  }

  /** Les raccourcis de la fiche d'atelier, par SKU (S2). */
  workshop(): Promise<WorkshopShortcutsView> {
    return firstValueFrom(this.http.get<WorkshopShortcutsView>(WORKSHOP));
  }
}

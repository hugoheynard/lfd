import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DoorstepSettingsPayload, DoorstepSettingsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const DOORSTEP = `${B2B_API_BASE}/admin/livraison/a-la-porte`;

/**
 * **La décision réglée d'avance à la porte, globale** (`a-la-porte.md`,
 * B3 bis), sous `delivery_settings`. Aucun état : la carte relit après une
 * écriture, et un refus remonte tel quel.
 */
@Injectable({ providedIn: 'root' })
export class DoorstepSettingsService {
  private readonly http = inject(HttpClient);

  settings(): Promise<DoorstepSettingsView> {
    return firstValueFrom(this.http.get<DoorstepSettingsView>(DOORSTEP));
  }

  async save(payload: DoorstepSettingsPayload): Promise<void> {
    await firstValueFrom(this.http.put(DOORSTEP, payload));
  }
}

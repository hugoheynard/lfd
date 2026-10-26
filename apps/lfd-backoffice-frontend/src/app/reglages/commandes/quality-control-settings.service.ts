import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { QualityControlSettingsPayload, QualityControlSettingsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Où le contrôle qualité se rend** — Réglages › Commandes (décision de Hugo,
 * 2026-10-26), `admin/production/quality-settings` sous `lfc_order_settings`.
 *
 * La Supervision ne lit pas cette route : les deux interrupteurs voyagent dans
 * ses pastilles (`QualityBoardView.enabled`).
 */
@Injectable({ providedIn: 'root' })
export class QualityControlSettingsService {
  private readonly http = inject(HttpClient);

  read(): Promise<QualityControlSettingsView> {
    return firstValueFrom(this.http.get<QualityControlSettingsView>(this.url()));
  }

  /** Pose les deux interrupteurs. `204` sans corps : l'appelant relit. */
  update(payload: QualityControlSettingsPayload): Promise<void> {
    return firstValueFrom(this.http.put<void>(this.url(), payload));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/production/quality-settings`;
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CounterSettingsView, CounterStockTrackingPayload } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les réglages du comptoir** — Réglages › Comptoir : le suivi de l'état du
 * stock, point par point, désactivé tant que le point n'a pas été réglé
 * (décidé par Hugo le 2026-11-19).
 *
 * La pose est idempotente côté serveur (`@Idempotent` : rejouer
 * `{ stockTracking }` pose le même état) : aucune clé d'intention.
 */
@Injectable({ providedIn: 'root' })
export class CounterSettingsService {
  private readonly http = inject(HttpClient);

  read(): Promise<CounterSettingsView> {
    return firstValueFrom(this.http.get<CounterSettingsView>(this.url()));
  }

  /** Pose le suivi du stock d'un point. `204` sans corps : l'appelant relit. */
  setStockTracking(siteId: string, payload: CounterStockTrackingPayload): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.url()}/${encodeURIComponent(siteId)}`, payload),
    );
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/counter-settings`;
  }
}

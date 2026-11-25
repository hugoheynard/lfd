import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CounterSettingsView, CounterSettingsPayload } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les réglages du comptoir** — Réglages › Comptoir, point par point : le
 * suivi de l'état du stock (Hugo, 2026-11-19) et le « Retrait immédiat » sans
 * le stock reçu (Hugo, 2026-11-25), désactivés tant que le point n'a pas été
 * réglé.
 *
 * La pose est idempotente côté serveur (`@Idempotent` : rejouer les deux
 * réglages pose le même état) : aucune clé d'intention.
 */
@Injectable({ providedIn: 'root' })
export class CounterSettingsService {
  private readonly http = inject(HttpClient);

  read(): Promise<CounterSettingsView> {
    return firstValueFrom(this.http.get<CounterSettingsView>(this.url()));
  }

  /** Pose les deux réglages d'un point. `204` sans corps : l'appelant relit. */
  setSettings(siteId: string, payload: CounterSettingsPayload): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.url()}/${encodeURIComponent(siteId)}`, payload),
    );
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/counter-settings`;
  }
}

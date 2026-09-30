import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DevSeedOrdersOnlyReport, DevSeedReport } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Recharger le jeu de données de développement.**
 *
 * Deux gestes : tout recharger, ou le seul scénario de commandes (celui de
 * `pnpm seed:orders`, qui repose lui-même ses clients — 2026-09-30).
 *
 * ⚠️ Ce service n'existe que dans un build de développement — il n'est atteint
 * que par la page du même dossier, elle-même absente du bundle de production
 * (cf. `dev-tools.ts`).
 */
@Injectable({ providedIn: 'root' })
export class DevSeedService {
  private readonly http = inject(HttpClient);

  reload(): Promise<DevSeedReport> {
    return firstValueFrom(
      this.http.post<DevSeedReport>(`${B2B_API_BASE}/admin/dev/seed/reload`, {}),
    );
  }

  reloadOrders(): Promise<DevSeedOrdersOnlyReport> {
    return firstValueFrom(
      this.http.post<DevSeedOrdersOnlyReport>(`${B2B_API_BASE}/admin/dev/seed/reload/orders`, {}),
    );
  }
}

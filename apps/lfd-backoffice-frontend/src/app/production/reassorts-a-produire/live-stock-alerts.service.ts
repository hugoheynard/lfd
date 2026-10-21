import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { LiveStockAlertsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les alertes de stock des points** — `/admin/site-stock-alerts/live`, sous
 * les mêmes droits que les réassorts à produire (fournée ou prévisionnel),
 * lot R1b du plan `reassort-boutiques/plan-reapprovisionnement.md`.
 */
@Injectable({ providedIn: 'root' })
export class LiveStockAlertsService {
  private readonly http = inject(HttpClient);

  read(): Promise<LiveStockAlertsView> {
    return firstValueFrom(
      this.http.get<LiveStockAlertsView>(`${B2B_API_BASE}/admin/site-stock-alerts/live`),
    );
  }
}

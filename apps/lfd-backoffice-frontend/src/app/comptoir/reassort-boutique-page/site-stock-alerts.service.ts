import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { SiteStockAlertsView, StockAlertLevel } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Rupture et stock faible** — `/admin/site-stock-alerts/sites/:siteId`,
 * sous le droit du comptoir (`handover_counter`), lot R1b du plan
 * `reassort-boutiques/plan-reapprovisionnement.md`.
 */
@Injectable({ providedIn: 'root' })
export class SiteStockAlertsService {
  private readonly http = inject(HttpClient);

  list(siteId: string): Promise<SiteStockAlertsView> {
    return firstValueFrom(this.http.get<SiteStockAlertsView>(this.site(siteId)));
  }

  declare(siteId: string, sku: string, level: StockAlertLevel): Promise<void> {
    return firstValueFrom(this.http.post<void>(this.site(siteId), { sku, level }));
  }

  lift(siteId: string, alertId: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.site(siteId)}/${encodeURIComponent(alertId)}/lift`, {}),
    );
  }

  private site(siteId: string): string {
    return `${B2B_API_BASE}/admin/site-stock-alerts/sites/${encodeURIComponent(siteId)}`;
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  PlacedSiteResupplyResponse,
  PlaceSiteResupplyPayload,
  SiteResuppliesView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Commander un réassort** — `/admin/site-resupplies/sites/:siteId`, sous
 * le droit du comptoir (`handover_counter`), lot R1 du plan
 * `reassort-boutiques/plan-reapprovisionnement.md`. L'écran relit la liste
 * après chaque geste.
 */
@Injectable({ providedIn: 'root' })
export class SiteResuppliesService {
  private readonly http = inject(HttpClient);

  list(siteId: string): Promise<SiteResuppliesView> {
    return firstValueFrom(this.http.get<SiteResuppliesView>(this.site(siteId)));
  }

  place(siteId: string, payload: PlaceSiteResupplyPayload): Promise<PlacedSiteResupplyResponse> {
    return firstValueFrom(this.http.post<PlacedSiteResupplyResponse>(this.site(siteId), payload));
  }

  cancel(siteId: string, resupplyId: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.site(siteId)}/${encodeURIComponent(resupplyId)}/cancel`, {}),
    );
  }

  private site(siteId: string): string {
    return `${B2B_API_BASE}/admin/site-resupplies/sites/${encodeURIComponent(siteId)}`;
  }
}

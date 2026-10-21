import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  PlacedSiteResupplyResponse,
  PlaceSiteResupplyPayload,
  ResupplyArticleView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Envoyer un réassort depuis le fournil** — `/admin/bakehouse-resupplies`,
 * sous le droit `production_resupply` (lot R1d,
 * `reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-21). Un réassort
 * à part : la demande en cours du comptoir n'est jamais touchée.
 */
@Injectable({ providedIn: 'root' })
export class BakehouseResuppliesService {
  private readonly http = inject(HttpClient);

  /** Le catalogue publié de la boutique, sans prix. */
  articles(): Promise<readonly ResupplyArticleView[]> {
    return firstValueFrom(this.http.get<readonly ResupplyArticleView[]>(`${this.base()}/articles`));
  }

  send(siteId: string, payload: PlaceSiteResupplyPayload): Promise<PlacedSiteResupplyResponse> {
    return firstValueFrom(
      this.http.post<PlacedSiteResupplyResponse>(
        `${this.base()}/sites/${encodeURIComponent(siteId)}`,
        payload,
      ),
    );
  }

  private base(): string {
    return `${B2B_API_BASE}/admin/bakehouse-resupplies`;
  }
}

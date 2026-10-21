import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  PlacedSiteResupplyResponse,
  ResupplyTarget,
  SiteResuppliesView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Commander un réassort** — `/admin/site-resupplies/sites/:siteId`, sous
 * le droit du comptoir (`handover_counter`), lots R1 et R1c du plan
 * `reassort-boutiques/plan-reapprovisionnement.md`. Depuis R1c, le comptoir
 * remplit la demande en cours de chaque visée (ajouter, corriger, retirer,
 * envoyer). L'écran relit la liste après chaque geste. Le geste d'un seul
 * tenant du fournil (`place`) est retiré au lot R1d : il envoyait la
 * demande du comptoir ; le fournil envoie les siens à part.
 */
@Injectable({ providedIn: 'root' })
export class SiteResuppliesService {
  private readonly http = inject(HttpClient);

  list(siteId: string): Promise<SiteResuppliesView> {
    return firstValueFrom(this.http.get<SiteResuppliesView>(this.site(siteId)));
  }

  /** Ajoute à la demande en cours de la visée ; un article présent voit sa quantité s'additionner. */
  addLine(
    siteId: string,
    target: ResupplyTarget,
    sku: string,
    quantity: number,
  ): Promise<PlacedSiteResupplyResponse> {
    return firstValueFrom(
      this.http.post<PlacedSiteResupplyResponse>(`${this.site(siteId)}/drafts/${target}/lines`, {
        sku,
        quantity,
      }),
    );
  }

  correctLine(
    siteId: string,
    resupplyId: string,
    sku: string,
    quantity: number,
    version: number,
  ): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(
        `${this.resupply(siteId, resupplyId)}/lines/${encodeURIComponent(sku)}`,
        {
          quantity,
          version,
        },
      ),
    );
  }

  withdrawLine(siteId: string, resupplyId: string, sku: string, version: number): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${this.resupply(siteId, resupplyId)}/lines/${encodeURIComponent(sku)}/withdraw`,
        { version },
      ),
    );
  }

  /** « Envoyer le réassort » : la demande en cours part au fournil. */
  send(siteId: string, resupplyId: string, version: number): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.resupply(siteId, resupplyId)}/send`, { version }),
    );
  }

  cancel(siteId: string, resupplyId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.resupply(siteId, resupplyId)}/cancel`, {}));
  }

  private site(siteId: string): string {
    return `${B2B_API_BASE}/admin/site-resupplies/sites/${encodeURIComponent(siteId)}`;
  }

  private resupply(siteId: string, resupplyId: string): string {
    return `${this.site(siteId)}/${encodeURIComponent(resupplyId)}`;
  }
}

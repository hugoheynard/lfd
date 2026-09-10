import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CatalogPendingDiffView,
  CatalogRevisionDiffView,
  CatalogRevisionSummaryView,
  CatalogRevisionTakenView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/**
 * Accès aux **révisions du catalogue** — les points d'ancrage de publication.
 *
 * Aucune forme de vue déclarée ici : elles viennent du contrat. Le front ne
 * redit pas ce que l'API affirme (cf. `lint:api-types-from-contracts`).
 */
@Injectable({ providedIn: 'root' })
export class RevisionsHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(): Promise<readonly CatalogRevisionSummaryView[]> {
    return firstValueFrom(this.http.get<readonly CatalogRevisionSummaryView[]>(this.url()));
  }

  take(label: string | null): Promise<CatalogRevisionTakenView> {
    return firstValueFrom(this.http.post<CatalogRevisionTakenView>(this.url(), { label }));
  }

  /**
   * Ce qui a bougé depuis la dernière ancre **publiée**, en détail.
   *
   * Distinct de l'état du catalogue, qui n'en rend que le compte : celui-ci
   * charge un payload par article modifié et interroge le journal. On ne le
   * demande donc que quand on veut voir, pas à chaque ouverture d'écran.
   */
  sinceLast(): Promise<CatalogPendingDiffView> {
    return firstValueFrom(this.http.get<CatalogPendingDiffView>(`${this.url()}/since-last`));
  }

  /**
   * **Nomme une ancre restée muette.** Le serveur refuse une ancre déjà nommée.
   *
   * `PATCH` : on ne remplace pas l'ancre, on comble le seul champ qu'elle ait
   * laissé vide.
   */
  async name(reference: string, label: string): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${this.url()}/${encodeURIComponent(reference)}/label`, { label }),
    );
  }

  diff(from: string, to: string): Promise<CatalogRevisionDiffView> {
    return firstValueFrom(
      this.http.get<CatalogRevisionDiffView>(`${this.url()}/${from}/diff/${to}`),
    );
  }

  private url(): string {
    return `${this.base}/catalogue/revisions`;
  }
}

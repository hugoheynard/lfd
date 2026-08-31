import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
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

  diff(from: number, to: number): Promise<CatalogRevisionDiffView> {
    return firstValueFrom(
      this.http.get<CatalogRevisionDiffView>(`${this.url()}/${from}/diff/${to}`),
    );
  }

  private url(): string {
    return `${this.base}/catalogue/revisions`;
  }
}

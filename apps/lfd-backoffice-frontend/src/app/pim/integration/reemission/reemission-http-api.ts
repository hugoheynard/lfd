import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreatedIdResponse } from '@lfd/contracts';
import type { CatalogReemissionView, LatestCatalogReemissionView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../../data/api';

/**
 * Les routes de la **réémission du catalogue**, suivie comme un travail
 * (2026-10-18) : lancer rend un identifiant tout de suite, le compte rendu
 * se relit ensuite.
 *
 * `providedIn: 'root'` : l'écran et les outils agent visent la même porte.
 */
@Injectable({ providedIn: 'root' })
export class ReemissionHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/channels/b2b/reemit`;

  /** Lance — une fiche, ou tout si `productId` vaut `null`. Rend l'identifiant du travail. */
  async start(productId: string | null): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(this.base, productId === null ? {} : { productId }),
    );
    return created.id;
  }

  /** La dernière réémission, toutes portées confondues, ou `null`. */
  async latest(): Promise<CatalogReemissionView | null> {
    const found = await firstValueFrom(
      this.http.get<LatestCatalogReemissionView>(`${this.base}/latest`),
    );
    return found.job;
  }

  byId(id: string): Promise<CatalogReemissionView> {
    return firstValueFrom(
      this.http.get<CatalogReemissionView>(`${this.base}/${encodeURIComponent(id)}`),
    );
  }
}

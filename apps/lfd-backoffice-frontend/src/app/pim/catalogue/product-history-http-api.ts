import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ProductHistoryPageView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/** Ce que l'onglet demande : une page, et l'ancre de la vue figée hors page 1. */
export interface ProductHistoryRequest {
  readonly page: number;
  readonly pageSize: number;
  /** Absente : la réponse fixe une ancre neuve. */
  readonly asOf?: string;
}

/**
 * Lecture de l'**historique d'une fiche produit**
 * (`GET /pim/catalogue/products/:id/history`).
 *
 * À part de `ProductHttpApi` : celui-là écrit la fiche, celui-ci ne fait que
 * relire le journal — le même partage que côté serveur, où la route a son
 * propre contrôleur.
 */
@Injectable({ providedIn: 'root' })
export class ProductHistoryHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  page(productId: string, request: ProductHistoryRequest): Promise<ProductHistoryPageView> {
    let params = new HttpParams()
      .set('page', String(request.page))
      .set('pageSize', String(request.pageSize));
    if (request.asOf !== undefined) {
      params = params.set('asOf', request.asOf);
    }
    return firstValueFrom(
      this.http.get<ProductHistoryPageView>(
        `${this.base}/catalogue/products/${encodeURIComponent(productId)}/history`,
        { params },
      ),
    );
  }
}

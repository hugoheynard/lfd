import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ArticleReservationView,
  CompanyReservedArticlesView,
  MadeToOrderMarkView,
  ReservedVisibility,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/catalog`;

const sku = (value: string): string => encodeURIComponent(value);

/**
 * **Les articles sur mesure et leur réservation** (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a) — un geste
 * nommé par route, comme le reste du paramétrage. Surface `lfc_catalog`.
 *
 * ⚠️ Tant que le lot L1b n'est pas déployé, une réservation ne restreint
 * rien : les écrans le disent.
 */
@Injectable({ providedIn: 'root' })
export class MadeToOrderService {
  private readonly http = inject(HttpClient);

  /** Les articles qui portent un réglage — joints au catalogue par SKU. */
  marks(): Promise<readonly MadeToOrderMarkView[]> {
    return firstValueFrom(this.http.get<readonly MadeToOrderMarkView[]>(`${BASE}/made-to-order`));
  }

  ofArticle(article: string): Promise<ArticleReservationView> {
    return firstValueFrom(
      this.http.get<ArticleReservationView>(`${BASE}/${sku(article)}/reservation`),
    );
  }

  ofCompany(companyId: string): Promise<CompanyReservedArticlesView> {
    return firstValueFrom(
      this.http.get<CompanyReservedArticlesView>(
        `${BASE}/reservations/${encodeURIComponent(companyId)}`,
      ),
    );
  }

  async setMadeToOrder(article: string, madeToOrder: boolean): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${BASE}/${sku(article)}/made-to-order`, { madeToOrder }),
    );
  }

  async setReservedVisibility(article: string, visibility: ReservedVisibility): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${BASE}/${sku(article)}/reserved-visibility`, { visibility }),
    );
  }

  async reserve(article: string, companyId: string): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(
        `${BASE}/${sku(article)}/reservations/${encodeURIComponent(companyId)}`,
        {},
      ),
    );
  }

  /** Irréversible côté client une fois le mur en place : l'écran a fait confirmer. */
  async release(article: string, companyId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(
        `${BASE}/${sku(article)}/reservations/${encodeURIComponent(companyId)}`,
      ),
    );
  }
}

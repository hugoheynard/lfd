import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { ProductBinding, PushSummary } from '../data/models';

export type {
  ProductBinding,
  PushOutcome,
  PushReport,
  PushSummary,
  ShopifySettings,
  SyncStatus,
} from '../data/models';

/**
 * Shopify **produit** — parle au backend (`channels/shopify/products`). L'état de
 * synchro (bindings) et le push (projection → empreinte → binding) vivent côté
 * serveur : le push est réel en mode `live`, simulé en `dry-run` (le backend
 * choisit d'après les réglages de connexion). Le front ne simule plus rien.
 */
@Injectable({ providedIn: 'root' })
export class ShopifyApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  listBindings(): Promise<ProductBinding[]> {
    return firstValueFrom(this.http.get<ProductBinding[]>(this.url('bindings')));
  }

  push(productIds?: string[]): Promise<PushSummary> {
    return firstValueFrom(
      this.http.post<PushSummary>(this.url('push'), productIds === undefined ? {} : { productIds }),
    );
  }

  private url(path: string): string {
    return `${this.base}/channels/shopify/products/${path}`;
  }
}

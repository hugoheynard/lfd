import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { Product } from '../data/models';
import { ProductHttpApi } from './product-http-api';

/**
 * Source **réactive** des produits pour les lecteurs qui projettent le catalogue
 * (collections, publication) — remplace `LocalDb.products`. La liste vient du
 * backend, donc son `categoryId` correspond aux familles backend et le join de
 * projection se referme. Les pages produit gardent leur accès impératif via
 * {@link ProductHttpApi} ; ce store ne sert que les `computed`/`effect`.
 */
@Injectable({ providedIn: 'root' })
export class ProductStore {
  private readonly api = inject(ProductHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<Product[]>([]);
  readonly items = this.state.asReadonly();

  constructor() {
    if (this.isBrowser) {
      // Auto-load best-effort : un backend injoignable laisse la liste vide,
      // il ne doit jamais devenir un rejet de promesse non géré.
      void this.reload().catch(() => undefined);
    }
  }

  async reload(): Promise<void> {
    this.state.set(await this.api.list());
  }
}

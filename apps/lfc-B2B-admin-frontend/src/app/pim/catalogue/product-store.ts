import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { Product } from '../data/models';
import { ProductHttpApi } from './product-http-api';
import { ListLoadState } from '../data/list-load-state';

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
  private readonly load = new ListLoadState();
  /**
   * Pourquoi la liste est vide — `null` = elle l'est vraiment. Les écrans le
   * lisent pour ne pas inviter à recréer ce qu'ils n'ont pas pu lire.
   */
  readonly loadError = this.load.error;

  constructor() {
    if (this.isBrowser) {
      // Le seul appelant qui ABSORBE l'échec : au démarrage, personne n'attend
      // ce chargement, et un rejet non géré ne rendrait service à personne. La
      // raison, elle, est retenue dans `loadError` — l'écran la lira plutôt que
      // d'afficher une liste vide qui ment.
      void this.reload().catch(() => undefined);
    }
  }

  async reload(): Promise<void> {
    await this.load.run(
      () => this.api.list(),
      (items) => this.state.set(items),
    );
  }
}

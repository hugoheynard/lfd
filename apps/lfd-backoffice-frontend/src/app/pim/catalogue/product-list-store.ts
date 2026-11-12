import { inject, Injectable, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

import type { Product } from '../data/models';
import { CatalogueApi } from './catalogue-api';
import type { ProductListing } from './product-http-api';

export type ProductListState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * **La liste des fiches du référentiel**, gardée tant que l'onglet vit
 * (`documentation/caching-usage/plan-lectures-du-pim.md`, § 4.3).
 *
 * - Lue à la **première** ouverture de l'écran, rien avant ; une réouverture
 *   montre la copie sans relire.
 * - Le veilleur la relit **en fond** quand le numéro `pim` bouge ; une
 *   relecture en fond ne repasse pas par le chargement, et un échec garde la
 *   copie.
 * - Après un geste, la liste entière se relit en fond : l'API n'a pas de
 *   lecture d'une ligne, et la liste est servie par l'objet partagé tant que
 *   personne d'autre n'a écrit.
 * - La copie retient le numéro `pim` que le serveur a lu AVANT ses lignes, et
 *   l'adopte à chaque relecture (toujours complète) : le veilleur ignore
 *   ainsi l'écho du propre geste, et relit sur un numéro différent.
 */
@Injectable({ providedIn: 'root' })
export class ProductListStore {
  private readonly api = inject(CatalogueApi);

  private readonly loadState = signal<ProductListState>('idle');
  private readonly list = signal<readonly Product[]>([]);
  private readonly failure = signal<string | null>(null);
  private readonly heldVersion = signal<number | null>(null);

  readonly state = this.loadState.asReadonly();
  readonly products = this.list.asReadonly();
  /** Pourquoi la première lecture a échoué ; `null` sinon. */
  readonly loadError = this.failure.asReadonly();
  /** Le numéro `pim` sous lequel la copie a été servie ; `null` avant toute lecture. */
  readonly version = this.heldVersion.asReadonly();

  /** Charge à la première ouverture, ou après un échec ; sinon rien. */
  async open(): Promise<void> {
    const state = this.loadState();
    if (state === 'idle' || state === 'error') {
      await this.load();
    }
  }

  /** Le chargement visible. Ne rejette pas : l'échec est dans `loadError`. */
  async load(): Promise<void> {
    this.loadState.set('loading');
    try {
      this.adopt(await this.api.listProducts());
      this.failure.set(null);
      this.loadState.set('ready');
    } catch (caught) {
      this.failure.set(httpErrorMessage(caught, 'Le service est injoignable.'));
      this.loadState.set('error');
    }
  }

  /**
   * La relecture en fond — le veilleur ou le filet. Ne rejette pas : un échec
   * garde la copie, le tour suivant reposera la question.
   */
  async refresh(): Promise<void> {
    if (this.loadState() !== 'ready') {
      return;
    }
    try {
      this.adopt(await this.api.listProducts());
    } catch {
      // La copie reste : le veilleur reposera la question.
    }
  }

  /** Retire une fiche supprimée de la copie, sans attendre de relecture. */
  remove(id: string): void {
    this.list.update((items) => items.filter((item) => item.id !== id));
  }

  private adopt(listing: ProductListing): void {
    this.list.set(listing.items);
    this.heldVersion.set(listing.version);
  }
}

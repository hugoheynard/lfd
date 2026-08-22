import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { Category, SalesChannels } from '../data/models';
import { CategoryHttpApi, type CategoryTvaDraft } from './category-http-api';
import { ListLoadState } from '../data/list-load-state';

/**
 * Source **réactive** unique des familles — remplace le signal LocalDb. Les
 * lecteurs (pages, collections, publication) lisent `items()` ; toute mutation
 * passe par ce store, qui écrit au backend puis relit, si bien que la liste se
 * met à jour partout. En SSR (démo statique sans backend) on ne fetch pas.
 */
@Injectable({ providedIn: 'root' })
export class CategoryStore {
  private readonly api = inject(CategoryHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<Category[]>([]);
  /** Lecture réactive de la liste courante. */
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

  async create(payload: {
    nameFr: string;
    parentId?: string | undefined;
  }): Promise<{ id: string }> {
    const created = await this.api.create(payload);
    await this.reload();
    return created;
  }

  async rename(id: string, nameFr: string): Promise<void> {
    await this.api.rename(id, nameFr);
    await this.reload();
  }

  async archive(id: string): Promise<void> {
    await this.api.archive(id);
    await this.reload();
  }

  async setChannels(id: string, channels: SalesChannels): Promise<void> {
    await this.api.setChannels(id, channels);
    await this.reload();
  }

  async setTva(id: string, ids: CategoryTvaDraft): Promise<void> {
    await this.api.setTva(id, ids);
    await this.reload();
  }
}

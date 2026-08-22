import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { TvaRate } from '../../data/models';
import { TvaHttpApi, type TvaRateInput } from './tva-http-api';
import { ListLoadState } from '../../data/list-load-state';

/**
 * Source **réactive** unique des taux de TVA — remplace le signal LocalDb.
 * Table, panneau et usages plateforme lisent `items()` ; les mutations passent
 * ici (backend puis relecture), donc tout ce qui affiche la liste se recompose.
 */
@Injectable({ providedIn: 'root' })
export class TvaStore {
  private readonly api = inject(TvaHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<TvaRate[]>([]);
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

  async create(input: TvaRateInput): Promise<{ id: string }> {
    const created = await this.api.create(input);
    await this.reload();
    return created;
  }

  async update(id: string, input: TvaRateInput): Promise<void> {
    await this.api.update(id, input);
    await this.reload();
  }

  async remove(id: string): Promise<void> {
    await this.api.remove(id);
    await this.reload();
  }
}

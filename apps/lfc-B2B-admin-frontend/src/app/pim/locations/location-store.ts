import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { Location } from '../data/models';
import { LocationHttpApi, type LocationInput } from './location-http-api';
import { ListLoadState } from '../data/list-load-state';

/**
 * Source **réactive** unique des emplacements — remplace le signal LocalDb. La
 * liste lit `items()` ; création / édition / suppression et les actions QR
 * passent ici (backend puis relecture), donc la liste se met à jour toute seule.
 */
@Injectable({ providedIn: 'root' })
export class LocationStore {
  private readonly api = inject(LocationHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<Location[]>([]);
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

  async create(input: LocationInput): Promise<{ id: string }> {
    const created = await this.api.create(input);
    await this.reload();
    return created;
  }

  async update(id: string, patch: Partial<LocationInput>): Promise<void> {
    await this.api.update(id, patch);
    await this.reload();
  }

  async remove(id: string): Promise<void> {
    await this.api.remove(id);
    await this.reload();
  }

  /** (Re)génère le QR d'une table ; le token neuf vient du serveur. */
  async generateTableQr(id: string, tableNumber: number): Promise<void> {
    await this.api.generateTableQr(id, tableNumber);
    await this.reload();
  }

  async removeTableQr(id: string, tableNumber: number): Promise<void> {
    await this.api.removeTableQr(id, tableNumber);
    await this.reload();
  }
}

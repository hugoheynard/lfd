import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import type { PointOfSaleView } from '@lfd/pim-contracts';

import { PointOfSaleHttpApi, type ShopInput } from './point-of-sale-http-api';
import { ListLoadState } from '../data/list-load-state';

/**
 * **D'où l'on vend** — source réactive unique des points de vente.
 *
 * Elle a remplacé `LocationStore` : la plateforme professionnelle n'était nulle
 * part à l'écran, parce qu'elle n'était nulle part dans le modèle — un `NULL`
 * dans une colonne de la matrice de canaux.
 *
 * Une seule liste, deux genres : les boutiques s'ouvrent, se règlent et se
 * ferment ; les plateformes sont semées au démarrage et ineffaçables.
 */
@Injectable({ providedIn: 'root' })
export class PointOfSaleStore {
  private readonly api = inject(PointOfSaleHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<PointOfSaleView[]>([]);
  readonly items = this.state.asReadonly();
  private readonly load = new ListLoadState();
  /**
   * Pourquoi la liste est vide — `null` = elle l'est vraiment. Les écrans le
   * lisent pour ne pas inviter à recréer ce qu'ils n'ont pas pu lire.
   */
  readonly loadError = this.load.error;

  /** Les deux genres, séparés pour l'écran — le serveur les rend dans une liste. */
  readonly shops = computed(() => this.items().filter((point) => point.kind === 'shop'));
  readonly platforms = computed(() => this.items().filter((point) => point.kind === 'platform'));

  constructor() {
    if (this.isBrowser) {
      // Le seul appelant qui ABSORBE l'échec : au démarrage, personne n'attend
      // ce chargement, et un rejet non géré ne rendrait service à personne. La
      // raison, elle, est retenue dans `loadError`.
      void this.reload().catch(() => undefined);
    }
  }

  async reload(): Promise<void> {
    await this.load.run(
      () => this.api.list(),
      (items) => this.state.set([...items]),
    );
  }

  async openShop(input: ShopInput): Promise<{ id: string }> {
    const created = await this.api.openShop(input);
    await this.reload();
    return created;
  }

  async update(id: string, patch: Partial<ShopInput>): Promise<void> {
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

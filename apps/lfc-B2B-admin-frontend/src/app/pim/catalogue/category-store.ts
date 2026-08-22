import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { Category, SalesChannels } from '../data/models';
import { CategoryHttpApi, type CategoryTvaDraft } from './category-http-api';
import { ListLoadState } from '../data/list-load-state';

/**
 * Ce qu'un écran de réglage écrit d'un coup. `id: null` = création ;
 * `parentId: null` = la racine.
 */
export interface CategorySettingsDraft {
  readonly id: string | null;
  readonly nameFr: string;
  readonly parentId: string | null;
  readonly channels: SalesChannels;
  readonly tva: CategoryTvaDraft;
}

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

  /**
   * Le réglage complet d'une famille — **une seule relecture**.
   *
   * Le référentiel découpe par section : un verbe pour le nom, un pour le
   * parent, un pour les canaux, un pour les taux. L'écran, lui, n'a qu'un
   * bouton. Quand chaque méthode du store relisait la liste entière derrière
   * son écriture, enregistrer coûtait jusqu'à quatre `PUT` et quatre `GET` —
   * l'écran se félicitait de ne plus écrire à chaque frappe, le store lui
   * reprenait ce qu'il avait gagné.
   *
   * Séquentiel et non parallèle : un refus doit arrêter la suite plutôt que
   * laisser quatre requêtes se croiser et une famille à moitié réglée. Et les
   * canaux passent AVANT les taux — fermer un canal efface son taux côté
   * référentiel, donc l'inverse écraserait ce qu'on vient de régler.
   *
   * Rend l'identifiant : en création, l'appelant ne l'a pas encore.
   */
  async saveSettings(draft: CategorySettingsDraft): Promise<string> {
    const id = draft.id === null ? await this.openNew(draft) : await this.reword(draft.id, draft);
    await this.api.setChannels(id, draft.channels);
    await this.api.setTva(id, draft.tva);
    await this.reload();
    return id;
  }

  private async openNew(draft: CategorySettingsDraft): Promise<string> {
    const created = await this.api.create(
      draft.parentId === null
        ? { nameFr: draft.nameFr }
        : { nameFr: draft.nameFr, parentId: draft.parentId },
    );
    return created.id;
  }

  /** Renomme et déplace — **seulement si ça a bougé**. On n'écrit pas pour rien. */
  private async reword(id: string, draft: CategorySettingsDraft): Promise<string> {
    const current = this.state().find((item) => item.id === id);
    if (current !== undefined && current.name.fr !== draft.nameFr) {
      await this.api.rename(id, draft.nameFr);
    }
    if (current !== undefined && current.parentId !== draft.parentId) {
      await this.api.move(id, draft.parentId);
    }
    return id;
  }

  async archive(id: string): Promise<void> {
    await this.api.archive(id);
    await this.reload();
  }
}

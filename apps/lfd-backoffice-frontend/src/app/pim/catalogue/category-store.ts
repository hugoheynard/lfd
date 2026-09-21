import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import { LOCALES, type LocalizedText } from '@lfd/pim-contracts';

import type { Category, SalesChannels } from '../data/models';
import { CategoryHttpApi, type CategoryVatDraft } from './category-http-api';
import { ListLoadState } from '../data/list-load-state';

/**
 * Deux noms disent-ils la même chose, **dans toutes les langues** ?
 *
 * La comparaison porte sur {@link LOCALES}, jamais sur les clés présentes : un
 * nom dont on vient d'effacer l'italien n'a plus la clé, l'autre l'a encore, et
 * comparer les clés présentes de chaque côté conclurait « identiques » — donc
 * ne renverrait rien et laisserait la traduction effacée en base.
 */
function sameText(a: LocalizedText, b: LocalizedText): boolean {
  return LOCALES.every((locale) => (a[locale] ?? '') === (b[locale] ?? ''));
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
   * Le nom et le parent, ensemble — la section « Identité » d'une page.
   *
   * Deux verbes côté référentiel, un seul geste à l'écran, et **aucune écriture
   * pour rien** : chacun ne part que si sa valeur a bougé. La comparaison se
   * fait sur la liste en mémoire, qui peut ne pas contenir la famille (page
   * ouverte par un lien direct) ; dans ce cas on ÉCRIT, parce que ne pas savoir
   * n'est pas savoir que non.
   */
  async renameAndMove(id: string, name: LocalizedText, parentId: string | null): Promise<void> {
    const current = this.state().find((item) => item.id === id);
    if (current === undefined || !sameText(current.name, name)) {
      await this.api.rename(id, name);
    }
    if (current === undefined || current.parentId !== parentId) {
      await this.api.move(id, parentId);
    }
    await this.reload();
  }

  /** La matrice de canaux d'une famille. */
  async setChannels(id: string, channels: SalesChannels): Promise<void> {
    await this.api.setChannels(id, channels);
    await this.reload();
  }

  /** Les taux, par clé de contexte. À écrire APRÈS les canaux : fermer un canal
   *  efface son taux côté référentiel. */
  async setVat(id: string, vat: CategoryVatDraft): Promise<void> {
    await this.api.setVat(id, vat);
    await this.reload();
  }

  /** Ouvre une famille et rend son identifiant. */
  async openNew(name: LocalizedText, parentId: string | null): Promise<string> {
    const created = await this.api.create(parentId === null ? { name } : { name, parentId });
    await this.reload();
    return created.id;
  }

  async archive(id: string): Promise<void> {
    await this.api.archive(id);
    await this.reload();
  }
}

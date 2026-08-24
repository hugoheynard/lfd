import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import { SOURCE_LOCALE, writeLocalized, type LocalizedText } from '@lfd/pim-contracts';

import type { Category, SalesChannels } from '../data/models';
import { CategoryHttpApi, type CategoryVatDraft } from './category-http-api';
import { ListLoadState } from '../data/list-load-state';

/**
 * Ce qu'un écran de réglage écrit d'un coup. `id: null` = création ;
 * `parentId: null` = la racine.
 */
export interface CategorySettingsDraft {
  readonly id: string | null;
  readonly nameFr: string;
  /**
   * Tout ce qui n'est PAS le nom — `null` pour une famille **gelée**.
   *
   * Une famille archivée n'accepte que son renommage : le référentiel refuse
   * ses canaux, ses taux et son déplacement. Les rendre absents d'un bloc,
   * plutôt que de laisser l'appelant les envoyer quand même, met la règle dans
   * le TYPE — l'écran ne peut plus demander ce qu'on sait refusé, et un
   * renommage ne peut plus partir devant trois écritures qui échoueront.
   */
  readonly settings: CategoryMutableSettings | null;
}

/** Les réglages qu'une famille vivante accepte. */
export interface CategoryMutableSettings {
  readonly parentId: string | null;
  readonly channels: SalesChannels;
  readonly vat: CategoryVatDraft;
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
    if (draft.settings !== null) {
      await this.api.setChannels(id, draft.settings.channels);
      await this.api.setVat(id, draft.settings.vat);
    }
    await this.reload();
    return id;
  }

  private async openNew(draft: CategorySettingsDraft): Promise<string> {
    const parentId = draft.settings?.parentId ?? null;
    const created = await this.api.create(
      parentId === null ? { name: { fr: draft.nameFr } } : { name: { fr: draft.nameFr }, parentId },
    );
    return created.id;
  }

  /**
   * Renomme et déplace — **seulement si ça a bougé**. On n'écrit pas pour rien.
   *
   * La comparaison se fait sur la liste en mémoire, qui peut ne pas contenir la
   * famille (premier chargement pas encore revenu, écran ouvert par un lien
   * direct). Dans ce cas on ÉCRIT, au lieu de conclure « rien n'a changé » :
   * ne pas savoir n'est pas savoir que non. Un enregistrement silencieusement
   * sans effet, qui rend la main comme un succès, est plus coûteux qu'une
   * écriture de trop.
   */
  private async reword(id: string, draft: CategorySettingsDraft): Promise<string> {
    const current = this.state().find((item) => item.id === id);
    if (current === undefined || current.name.fr !== draft.nameFr) {
      // On repart du nom EXISTANT : renommer en français ne doit pas effacer
      // les traductions qu'on ne montre pas encore. Un `{ fr }` nu remplaçait
      // l'objet entier, donc chaque renommage perdait l'anglais en silence.
      const base: LocalizedText = current?.name ?? { fr: draft.nameFr };
      await this.api.rename(id, writeLocalized(base, SOURCE_LOCALE, draft.nameFr));
    }
    // Le déplacement ne concerne que les vivantes : `settings` est absent sinon.
    if (draft.settings !== null) {
      const { parentId } = draft.settings;
      if (current === undefined || current.parentId !== parentId) {
        await this.api.move(id, parentId);
      }
    }
    return id;
  }

  async archive(id: string): Promise<void> {
    await this.api.archive(id);
    await this.reload();
  }
}

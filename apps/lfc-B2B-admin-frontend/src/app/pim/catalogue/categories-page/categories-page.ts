import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowCardDirective,
  FoldIconComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { boutiquesWith } from '../../data/channels';
import { CategoryStore } from '../category-store';
import { TvaStore } from '../tva-rates/tva-store';
import { EmplacementStore } from '../../emplacements/emplacement-store';
import { CategoryPanel, type CategoryPanelData } from '../category-panel/category-panel';
import type { Category } from '../catalogue-api';

/**
 * Catégories (= familles = gammes). Chaque catégorie porte les **défauts de
 * canaux** et les **taux de TVA** (à emporter / sur place) dont héritent ses
 * produits.
 *
 * La page ne fait plus que **lister**. Créer, régler — nom, canaux, taux — et
 * archiver passent tous par le MÊME side-panel : les trois points d'une ligne
 * l'ouvrent sur cette famille, le bouton d'en-tête l'ouvre vide. La page portait
 * en plus une carte « Ajouter » à deux champs, qui ne proposait ni canaux ni
 * taux : toute famille naissait incomplète, à finir dans un second écran.
 *
 * La colonne TVA a quitté le tableau. Elle affichait deux taux hérités qu'on ne
 * peut ni comparer ni trier utilement, et que le panneau montre en contexte,
 * avec le canal qui les justifie.
 *
 * La liste se lit directement depuis les stores : toute mutation, d'où qu'elle
 * vienne, s'y voit sans que la page ait à recharger quoi que ce soit.
 */
@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldButtonComponent,
    FoldBadgeComponent,
    FoldIconComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    // Sans elle, `foldRowCard` n'est qu'un attribut inerte : Angular ne s'en
    // plaint pas, le build reste vert, et la vue mobile rend le vide.
    FoldDataTableRowCardDirective,
  ],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.scss',
})
export class CategoriesPage {
  private readonly categoryStore = inject(CategoryStore);
  private readonly tvaStore = inject(TvaStore);
  private readonly emplacementStore = inject(EmplacementStore);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Lectures réactives : le panneau écrit dans les stores, la table suit. */
  protected readonly categories = this.categoryStore.items;
  protected readonly rates = this.tvaStore.items;
  /** Les noms affichés dans les pastilles viennent du référentiel. */
  protected readonly emplacements = this.emplacementStore.items;

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Nom' },
    { key: 'parent', label: 'Parent' },
    { key: 'products', label: 'Fiches', width: '8rem' },
    { key: 'channels', label: 'Canaux par défaut' },
    { key: 'actions', label: '', align: 'right', width: '5rem' },
  ];

  /** Vide parce qu'il n'y en a pas, ou parce qu'on n'a pas pu lire ? */
  protected readonly emptyState = computed(() =>
    this.categoryStore.loadError() === null
      ? { title: 'Aucune catégorie', subtitle: 'Commencez par « Viennoiseries ».' }
      : { title: 'Catégories illisibles', subtitle: this.categoryStore.loadError() ?? '' },
  );

  protected readonly rowKey = (category: Category): string => category.id;

  protected parentName(category: Category): string {
    if (category.parentId === null) {
      return '—';
    }
    return this.categories().find((item) => item.id === category.parentId)?.name.fr ?? '—';
  }

  protected presetEmporter(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'emporter', this.emplacements());
  }

  protected presetSurPlace(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'surPlace', this.emplacements());
  }

  /** Ouvre la famille — une seule action par ligne, réglages et archivage compris. */
  protected open(category: Category): void {
    const data: CategoryPanelData = { category, rates: this.rates() };
    this.panelHost.open(CategoryPanel, { data, side: 'right' });
  }

  /** Le même panneau, sans famille : il crée. */
  protected openCreate(): void {
    const data: CategoryPanelData = { rates: this.rates() };
    this.panelHost.open(CategoryPanel, { data, side: 'right' });
  }
}

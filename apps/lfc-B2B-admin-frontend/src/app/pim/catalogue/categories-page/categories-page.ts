import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowCardDirective,
  FoldElementTitleComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { boutiquesWith, formatPercent } from '../../data/channels';
import { CategoryStore } from '../category-store';
import { TvaStore } from '../tva-rates/tva-store';
import { CategoryPanel, type CategoryPanelData } from '../category-panel/category-panel';
import { CatalogueApi, type Category } from '../catalogue-api';

/**
 * Catégories (= familles = gammes). Chaque catégorie porte les **défauts de
 * canaux** et les **taux de TVA** (à emporter / sur place) dont héritent ses
 * produits.
 *
 * La page ne fait plus que **lister et créer**. Le réglage d'une famille — nom,
 * canaux, taux — et son archivage vivent dans un side-panel ouvert par les trois
 * points de sa ligne. Avant, une carte d'édition s'ouvrait EN HAUT de la page et
 * poussait le tableau vers le bas : on perdait de vue la ligne qu'on réglait. Et
 * « Archiver » était posé à même la ligne, à un clic d'un bouton voisin.
 *
 * La liste se lit directement depuis les stores : toute mutation, d'où qu'elle
 * vienne, s'y voit sans que la page ait à recharger quoi que ce soit.
 */
@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldIconComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    // Sans elle, `foldRowCard` n'est qu'un attribut inerte : Angular ne s'en
    // plaint pas, le build reste vert, et la vue mobile rend le vide.
    FoldDataTableRowCardDirective,
    FoldElementTitleComponent,
  ],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.scss',
})
export class CategoriesPage {
  private readonly api = inject(CatalogueApi);
  private readonly categoryStore = inject(CategoryStore);
  private readonly tvaStore = inject(TvaStore);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Lectures réactives : le panneau écrit dans les stores, la table suit. */
  protected readonly categories = this.categoryStore.items;
  protected readonly rates = this.tvaStore.items;

  protected readonly draftName = signal('');
  protected readonly draftParent = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Nom' },
    { key: 'parent', label: 'Parent' },
    { key: 'products', label: 'Fiches', width: '8rem' },
    { key: 'tva', label: 'TVA (emporter → sur place)' },
    { key: 'channels', label: 'Canaux par défaut' },
    { key: 'actions', label: '', align: 'right', width: '5rem' },
  ];

  protected readonly emptyState = {
    title: 'Aucune catégorie',
    subtitle: 'Commencez par « Viennoiseries ».',
  };

  protected readonly rowKey = (category: Category): string => category.id;

  private readonly rateById = computed(() => new Map(this.rates().map((rate) => [rate.id, rate])));

  protected activeCategories(): Category[] {
    return this.categories().filter((category) => !category.isArchived);
  }

  protected parentName(category: Category): string {
    if (category.parentId === null) {
      return '—';
    }
    return this.categories().find((item) => item.id === category.parentId)?.name.fr ?? '—';
  }

  protected rateOf(rateId: string): string {
    const rate = this.rateById().get(rateId);
    return rate === undefined ? '—' : formatPercent(rate.percent);
  }

  protected presetEmporter(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'emporter');
  }

  protected presetSurPlace(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'surPlace');
  }

  /** Ouvre la famille — une seule action par ligne, réglages et archivage compris. */
  protected open(category: Category): void {
    const data: CategoryPanelData = { category, rates: this.rates() };
    this.panelHost.open(CategoryPanel, { data, side: 'right' });
  }

  protected async create(): Promise<void> {
    const nameFr = this.draftName().trim();
    if (nameFr === '') {
      return;
    }
    const parentId = this.draftParent();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.createCategory(parentId === '' ? { nameFr } : { nameFr, parentId });
      this.draftName.set('');
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : 'Erreur inattendue.');
    } finally {
      this.busy.set(false);
    }
  }
}

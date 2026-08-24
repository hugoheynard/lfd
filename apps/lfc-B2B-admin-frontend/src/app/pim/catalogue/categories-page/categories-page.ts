import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowCardDirective,
  FoldIconComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldToggleIconComponent,
  type FoldIconName,
  type FoldTableColumn,
} from 'fold-ng';

import { boutiquesWith } from '../../data/channels';
import { CategoryStore } from '../category-store';
import { VatRateStore } from '../vat-rates/vat-store';
import { LocationStore } from '../../locations/location-store';
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
 * Les familles archivées sont **masquées par défaut** : ce sont des lignes
 * mortes, et elles poussaient les vivantes vers le bas. L'œil de l'en-tête les
 * rappelle, et ne s'affiche que s'il y en a — un interrupteur qui ne commande
 * rien n'a pas à occuper la barre.
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
    // Un seul gabarit de pastilles pour la colonne ET la carte.
    NgTemplateOutlet,
    FoldPageLayoutComponent,
    FoldButtonComponent,
    FoldToggleIconComponent,
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
  private readonly vatRateStore = inject(VatRateStore);
  private readonly locationStore = inject(LocationStore);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Lectures réactives : le panneau écrit dans les stores, la table suit. */
  protected readonly categories = this.categoryStore.items;
  /** Les archivées sont hors de vue tant qu'on ne les rappelle pas. */
  protected readonly showArchived = signal(false);
  protected readonly rates = this.vatRateStore.items;
  /** Les noms affichés dans les pastilles viennent du référentiel. */
  protected readonly locations = this.locationStore.items;

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Nom' },
    { key: 'parent', label: 'Parent' },
    { key: 'products', label: 'Fiches', width: '8rem' },
    { key: 'channels', label: 'Canaux par défaut' },
    { key: 'actions', label: '', align: 'right', width: '5rem' },
  ];

  protected readonly archivedCount = computed(
    () => this.categories().filter((category) => category.isArchived).length,
  );

  /** Les lignes réellement affichées. */
  protected readonly visible = computed(() =>
    this.showArchived()
      ? this.categories()
      : this.categories().filter((category) => !category.isArchived),
  );

  protected readonly eyeIcon = computed<FoldIconName>(() =>
    this.showArchived() ? 'eye' : 'eye-off',
  );
  protected readonly eyeTooltip = computed(() => {
    if (this.showArchived()) {
      return 'Masquer les familles archivées';
    }
    const count = this.archivedCount();
    return count === 1
      ? 'Afficher la famille archivée'
      : `Afficher les ${count} familles archivées`;
  });

  /**
   * Vide parce qu'il n'y en a pas, parce qu'on n'a pas pu lire, ou parce qu'on
   * les a toutes masquées ? Les trois se ressemblent à l'écran et n'appellent
   * pas du tout le même geste.
   */
  protected readonly emptyState = computed(() => {
    const failure = this.categoryStore.loadError();
    if (failure !== null) {
      return { title: 'Catégories illisibles', subtitle: failure };
    }
    if (this.archivedCount() > 0) {
      const count = this.archivedCount();
      return {
        title: 'Aucune famille active',
        subtitle:
          count === 1
            ? "Une famille archivée — l'œil la rappelle."
            : `${count} familles archivées — l'œil les rappelle.`,
      };
    }
    return { title: 'Aucune catégorie', subtitle: 'Commencez par « Viennoiseries ».' };
  });

  protected readonly rowKey = (category: Category): string => category.id;

  protected parentName(category: Category): string {
    if (category.parentId === null) {
      return '—';
    }
    return this.categories().find((item) => item.id === category.parentId)?.name.fr ?? '—';
  }

  /** Le compte de fiches en TAG, jamais en blanc : une carte lit mal un vide. */
  protected ficheLabel(category: Category): string {
    const count = category.activeProductCount;
    return count === 0 ? 'Aucune fiche' : `${count} fiche(s)`;
  }

  protected presetEmporter(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'emporter', this.locations());
  }

  protected presetSurPlace(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'surPlace', this.locations());
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

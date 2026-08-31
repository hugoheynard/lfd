import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { AllergenCategoryAdminView, AllergenEntryAdminView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldChoiceRowComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInfoComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldChoiceOption,
  type FoldIconName,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { AllergenStore } from '../allergen-store';
import {
  NON_EU_REASON,
  OFFICIAL_CATEGORY_REASON,
  categoryOrigin,
  offeredCount,
} from '../allergen-support';
import { AllergenCategoryPanel } from '../allergen-category-panel/allergen-category-panel';
import {
  AllergenEntryPanel,
  type AllergenEntryPanelData,
} from '../allergen-entry-panel/allergen-entry-panel';

/** Ce qu'on regarde : tout, ce qui est encore offert, ou ce qui a été retiré. */
type CatalogueFilter = 'all' | 'living' | 'archived';

/** Une catégorie et les entrées que le filtre courant laisse voir. */
interface CategoryRow {
  readonly category: AllergenCategoryAdminView;
  readonly entries: readonly AllergenEntryAdminView[];
}

/**
 * **Allergènes** — le référentiel, et rien d'autre.
 *
 * Deux populations vivent ici et n'ont pas les mêmes droits, et tout l'écran
 * tient à les rendre distinctes :
 *
 * - **l'officiel** — les 15 catégories semées (les 14 de l'annexe II du
 *   règlement UE 1169/2011, plus « Hors obligation UE ») et les 30 codes GS1.
 *   C'est du droit : ni renommable, ni archivable. Il s'affiche sous **cadenas
 *   avec sa raison** — un bouton absent sans mot se lit comme une panne, et un
 *   bouton qui répondrait 409 est pire ;
 * - **le maison** — ce que le staff ouvre ensuite. Modifiable, archivable,
 *   restaurable.
 *
 * Les entrées se lisent **sous** leur catégorie parce que le mapping est n:1 et
 * que c'est la raison d'être du modèle : sept céréales sous « Céréales
 * contenant du gluten », huit fruits sous « Fruits à coque ». Une liste à plat
 * perdrait ce que l'étiquette, elle, affiche.
 *
 * ⚠️ Ce que **chaque fiche** déclare ne se coche pas ici : ça se prend en
 * regardant le produit, sur la déclinaison mise sur le marché. Cet écran dit ce
 * qui EXISTE, pas ce que contient un produit.
 *
 * Et il montre les archivés — c'est le seul d'où l'on restaure. Une ligne qu'on
 * ne voit pas est une ligne qu'on ne peut plus remettre.
 */
@Component({
  selector: 'app-allergens-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldChoiceRowComponent,
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldButtonComponent,
    FoldIconComponent,
    FoldInfoComponent,
  ],
  templateUrl: './allergens-page.html',
  styleUrl: './allergens-page.scss',
})
export class AllergensPage {
  private readonly store = inject(AllergenStore);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);

  protected readonly officialCategoryReason = OFFICIAL_CATEGORY_REASON;
  protected readonly nonEuReason = NON_EU_REASON;

  protected readonly canWrite = computed(() => this.permissions.can('catalog:write'));
  protected readonly categories = this.store.categories;
  protected readonly loadError = this.store.loadError;
  protected readonly firstLoad = this.store.firstLoad;

  protected readonly filter = signal<CatalogueFilter>('all');

  /** Le compte de chaque vue — une ligne = une catégorie ou une entrée. */
  protected readonly filters = computed<readonly FoldChoiceOption[]>(() => {
    const rows = this.categories();
    const entries = rows.flatMap((category) => category.entries);
    const archived =
      rows.filter((category) => category.archivedAt !== null).length +
      entries.filter((entry) => entry.archivedAt !== null).length;
    const total = rows.length + entries.length;
    return [
      { key: 'all', label: 'Tout', count: total },
      { key: 'living', label: 'Au référentiel', count: total - archived },
      { key: 'archived', label: 'Archivés', count: archived },
    ];
  });

  /**
   * Ce que le filtre laisse voir. Une catégorie vivante reste affichée en vue
   * « Archivés » quand elle abrite une entrée retirée : c'est de là qu'on la
   * restaure, et la masquer rendrait le geste introuvable.
   */
  protected readonly rows = computed<readonly CategoryRow[]>(() => {
    const mode = this.filter();
    return this.categories()
      .map((category) => ({ category, entries: this.entriesFor(category, mode) }))
      .filter(({ category, entries }) => this.keeps(category, entries, mode));
  });

  protected origin(category: AllergenCategoryAdminView): string {
    return categoryOrigin(category);
  }

  /** « Clé « gluten » · 7 proposés sur 7 » — ce que la carte dit sous son titre. */
  protected subtitle(category: AllergenCategoryAdminView): string {
    const offered = offeredCount(category);
    return `Clé « ${category.key} » · ${offered} proposé(s) sur ${category.entries.length}`;
  }

  protected categoryIcon(category: AllergenCategoryAdminView): FoldIconName {
    return category.official ? 'lock' : 'tag';
  }

  /** Officielle et sans mention INCO : la seule que le catalogue légal écarte. */
  protected isNonEu(category: AllergenCategoryAdminView): boolean {
    return category.official && category.incoCategory === null;
  }

  protected setFilter(key: string): void {
    if (key === 'all' || key === 'living' || key === 'archived') {
      this.filter.set(key);
    }
  }

  protected openCategory(category?: AllergenCategoryAdminView): void {
    this.panelHost.open<boolean>(AllergenCategoryPanel, {
      side: 'right',
      ...(category === undefined ? {} : { data: { category } }),
    });
  }

  protected openEntry(category: AllergenCategoryAdminView, entry?: AllergenEntryAdminView): void {
    this.panelHost.open<AllergenEntryPanelData, boolean>(AllergenEntryPanel, {
      side: 'right',
      data: { categoryId: category.id, ...(entry === undefined ? {} : { entry }) },
    });
  }

  protected restoreCategory(category: AllergenCategoryAdminView): void {
    void this.run(() => this.store.restoreCategory(category.id));
  }

  protected restoreEntry(entry: AllergenEntryAdminView): void {
    void this.run(() => this.store.restoreEntry(entry.id));
  }

  protected retry(): void {
    void this.store.reload().catch(() => undefined);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (caught) {
      this.notify.refused(caught, 'Restauration refusée.');
    }
  }

  private entriesFor(
    category: AllergenCategoryAdminView,
    mode: CatalogueFilter,
  ): readonly AllergenEntryAdminView[] {
    if (mode === 'all') {
      return category.entries;
    }
    const archived = mode === 'archived';
    return category.entries.filter((entry) => (entry.archivedAt !== null) === archived);
  }

  private keeps(
    category: AllergenCategoryAdminView,
    entries: readonly AllergenEntryAdminView[],
    mode: CatalogueFilter,
  ): boolean {
    if (mode === 'all') {
      return true;
    }
    if (mode === 'living') {
      return category.archivedAt === null;
    }
    return category.archivedAt !== null || entries.length > 0;
  }
}

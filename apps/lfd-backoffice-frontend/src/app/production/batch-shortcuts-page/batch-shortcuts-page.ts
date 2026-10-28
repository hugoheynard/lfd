import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  MAX_BATCH_SHORTCUTS_PER_PRODUCT,
  type BatchShortcutArticleView,
  type BatchShortcutsSettingsView,
  type BatchShortcutView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldSearchComponent,
  FoldViewToggleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import {
  BatchShortcutDialog,
  type BatchShortcutDialogData,
} from '../batch-shortcut-dialog/batch-shortcut-dialog';
import { BatchShortcutsService } from '../batch-shortcuts.service';
import { ALL_FAMILIES, articlesMatching, familyOptionsOf } from './shortcut-filters';

/** Le téléphone — le seuil de la table du réassort, dont celle-ci reprend la forme. */
const PHONE_QUERY = '(max-width: 768px)';

/** Les colonnes ; leurs cellules sont des gabarits (`foldCell`). */
const COLUMNS: readonly FoldTableColumn<BatchShortcutArticleView>[] = [
  { key: 'family', label: 'Famille' },
  { key: 'product', label: 'Produit' },
  { key: 'shortcuts', label: 'Raccourcis' },
];

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: BatchShortcutsSettingsView };

/**
 * **Réglages › Production › Raccourcis du fournil** (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, S1).
 *
 * Une `fold-data-table` de tous les produits vendables, filtrée par famille
 * et par recherche sur une ligne au-dessus (la forme de la table du
 * réassort). Chaque ligne montre ses raccourcis en pastilles « 1 plaque · 24 »
 * et un bouton « Ajouter un raccourci » ; une pastille ouvre son dialogue.
 *
 * Lue sous `production_settings:read` ; sans `:write`, la table se lit
 * seulement — pastilles muettes, aucun bouton. L'écran relit après chaque
 * geste du dialogue.
 */
@Component({
  selector: 'app-batch-shortcuts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldSearchComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './batch-shortcuts-page.html',
  styleUrl: './batch-shortcuts-page.scss',
})
export class BatchShortcutsPage {
  private readonly api = inject(BatchShortcutsService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('production_settings:write'));
  protected readonly phone = narrowViewport(PHONE_QUERY);
  protected readonly state = signal<LoadState>({ status: 'loading' });
  protected readonly query = signal('');
  protected readonly family = signal<string>(ALL_FAMILIES);
  protected readonly max = MAX_BATCH_SHORTCUTS_PER_PRODUCT;

  private readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });

  /** Les raccourcis vivants, par SKU, dans l'ordre servi. */
  protected readonly bySku = computed(() => {
    const bySku = new Map<string, BatchShortcutView[]>();
    for (const shortcut of this.view()?.shortcuts ?? []) {
      bySku.set(shortcut.sku, [...(bySku.get(shortcut.sku) ?? []), shortcut]);
    }
    return bySku;
  });

  protected readonly familyOptions = computed(() =>
    familyOptionsOf(this.view()?.articles ?? [], new Set(this.bySku().keys())),
  );
  protected readonly visibleArticles = computed(() =>
    articlesMatching(this.view()?.articles ?? [], this.family(), this.query()),
  );
  /** En mobile, la famille est dans le filtre : la table garde produit et raccourcis. */
  protected readonly columns = computed(() =>
    this.phone() ? COLUMNS.filter((column) => column.key !== 'family') : COLUMNS,
  );
  protected readonly skuOf = (article: BatchShortcutArticleView): string => article.sku;
  protected readonly nothingFound = { title: 'Aucun produit ne correspond.' };

  constructor() {
    void this.load();
  }

  protected shortcutsOf(sku: string): readonly BatchShortcutView[] {
    return this.bySku().get(sku) ?? [];
  }

  protected retry(): void {
    void this.load();
  }

  /** « Ajouter un raccourci » — le nom proposé est « 1 plaque ». */
  protected async add(article: BatchShortcutArticleView): Promise<void> {
    await this.open({ sku: article.sku, productName: article.name, shortcut: null });
  }

  /** Une pastille touchée : son dialogue, pour la modifier ou la supprimer. */
  protected async edit(
    article: BatchShortcutArticleView,
    shortcut: BatchShortcutView,
  ): Promise<void> {
    await this.open({ sku: article.sku, productName: article.name, shortcut });
  }

  private async open(data: Omit<BatchShortcutDialogData, 'canWrite'>): Promise<void> {
    const changed = await this.panels.open<BatchShortcutDialogData, boolean>(BatchShortcutDialog, {
      data: { ...data, canWrite: this.canWrite() },
      // Centré au bureau ; la feuille du bas sous le pouce.
      side: this.phone() ? 'bottom' : 'center',
      width: 'sm',
      surface: 'solid',
    }).closed;
    if (changed === true) {
      await this.load();
    }
  }

  private async load(): Promise<void> {
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      this.state.set({ status: 'ready', view: await this.api.settings() });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { Router, RouterLink } from '@angular/router';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldPageLayoutComponent,
  FoldPaginatorComponent,
  FoldPopoverTriggerDirective,
  FoldSearchComponent,
  type FoldBadgeVariant,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import {
  boutiquesWith,
  formatPercent,
  resolveChannels,
} from '../../data/channels';
import {
  ShopifyApi,
  type ProductBinding,
  type SyncStatus,
} from '../../channels/shopify-api';

import {
  CatalogueApi,
  type Category,
  type Product,
  type SalesChannels,
  type TvaRegime,
} from '../catalogue-api';

const SYNC_LABELS: Record<SyncStatus, string> = {
  never_pushed: 'jamais poussé',
  up_to_date: 'à jour',
  drifted: 'en écart',
  failed: 'échec',
};

const SYNC_VARIANTS: Record<SyncStatus, FoldBadgeVariant> = {
  never_pushed: 'neutral',
  up_to_date: 'success',
  drifted: 'warning',
  failed: 'alert',
};

const NO_CHANNELS: SalesChannels = {
  b1: { emporter: false, surPlace: false },
  b2: { emporter: false, surPlace: false },
};

@Component({
  selector: 'app-products-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldPageLayoutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldSearchComponent,
    FoldPaginatorComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldPopoverTriggerDirective,
    FoldIconComponent,
  ],
  templateUrl: './products-page.html',
  styleUrl: './products-page.scss',
})
export class ProductsPage {
  private readonly api = inject(CatalogueApi);
  private readonly shopify = inject(ShopifyApi);
  private readonly router = inject(Router);

  protected readonly products = signal<Product[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly bindings = signal<ProductBinding[]>([]);
  protected readonly regimes = signal<TvaRegime[]>([]);
  protected readonly pushMessage = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);

  /** Sélection multi-lignes (clés = ids produit) pour les actions groupées. */
  protected readonly selection = signal<ReadonlySet<string | number>>(new Set());
  protected readonly selectedCount = computed(() => this.selection().size);
  private readonly selectedIds = computed(() =>
    [...this.selection()].map((key) => String(key)),
  );

  /** Filtre du tableau : par nom ou par référence. */
  protected readonly visibleProducts = computed<Product[]>(() => {
    const q = this.query().trim().toLowerCase();
    const products = this.products();
    if (q === '') {
      return products;
    }
    return products.filter(
      (p) =>
        p.name.fr.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  });

  /** Nombre de pages, page courante bornée, et la tranche affichée. */
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.visibleProducts().length / this.pageSize())),
  );

  protected readonly currentPage = computed(() =>
    Math.min(this.page(), this.pageCount()),
  );

  protected readonly pagedProducts = computed<Product[]>(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.visibleProducts().slice(start, start + this.pageSize());
  });

  /** Santé de synchro du catalogue — le statut de la barre de titre. */
  protected readonly catalogueStatus = computed<{
    label: string;
    variant: FoldBadgeVariant;
  }>(() => {
    const products = this.products();
    if (products.length === 0) {
      return { label: 'vide', variant: 'neutral' };
    }
    let failed = 0;
    let drifted = 0;
    let pending = 0;
    for (const product of products) {
      const status = this.syncStatus(product.id);
      if (status === 'failed') {
        failed += 1;
      } else if (status === 'drifted') {
        drifted += 1;
      } else if (status === 'never_pushed') {
        pending += 1;
      }
    }
    if (failed > 0) {
      return { label: `${failed} en échec`, variant: 'alert' };
    }
    if (drifted > 0) {
      return { label: `${drifted} en écart`, variant: 'warning' };
    }
    if (pending > 0) {
      return { label: `${pending} à pousser`, variant: 'info' };
    }
    return { label: 'à jour', variant: 'success' };
  });

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'sku', label: 'Référence', width: '9rem' },
    { key: 'name', label: 'Nom' },
    { key: 'category', label: 'Famille' },
    { key: 'channels', label: 'Canaux', width: '12rem' },
    { key: 'status', label: 'État' },
    { key: 'sync', label: 'Shopify' },
    { key: 'actions', label: '', align: 'right', width: '8rem' },
  ];

  protected readonly emptyState = {
    title: 'Aucun produit',
    subtitle: 'Créez votre premier produit pour démarrer le catalogue.',
  };

  protected readonly rowKey = (product: Product): string => product.id;

  protected readonly rowTone = (product: Product): FoldTableTone =>
    this.syncStatus(product.id) === 'failed' ? 'alert' : null;

  private readonly bindingById = computed(
    () => new Map(this.bindings().map((binding) => [binding.productId, binding])),
  );

  private readonly byId = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  private readonly regimeById = computed(
    () => new Map(this.regimes().map((regime) => [regime.id, regime])),
  );

  constructor() {
    void this.reload();
  }

  /** Un clic sur une ligne ouvre la page produit (plus d'édition dans la table). */
  protected openProduct(product: Product): void {
    void this.router.navigate(['/produits', product.id]);
  }

  /** Filtrer remet en page 1 pour ne pas rester sur une page vide. */
  protected onSearch(query: string): void {
    this.query.set(query);
    this.page.set(1);
  }

  protected onPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  protected syncStatus(productId: string): SyncStatus {
    return this.bindingById().get(productId)?.syncStatus ?? 'never_pushed';
  }

  protected syncLabel(productId: string): string {
    return SYNC_LABELS[this.syncStatus(productId)];
  }

  protected syncVariant(productId: string): FoldBadgeVariant {
    return SYNC_VARIANTS[this.syncStatus(productId)];
  }

  protected rowEmporter(product: Product): string[] {
    return boutiquesWith(this.rowChannels(product), 'emporter');
  }

  protected rowSurPlace(product: Product): string[] {
    return boutiquesWith(this.rowChannels(product), 'surPlace');
  }

  protected rowInherited(product: Product): boolean {
    return product.channelsOverride === null;
  }

  /** « 5,5 % → 10 % » : les taux à emporter / sur place de la catégorie. */
  protected categoryTvaText(category: Category): string {
    const emporter = this.regimeById().get(category.emporterTvaId);
    const surPlace = this.regimeById().get(category.surPlaceTvaId);
    const rate = (regime: TvaRegime | undefined): string =>
      regime === undefined ? '—' : formatPercent(regime.percent);
    return `${rate(emporter)} → ${rate(surPlace)}`;
  }

  /** Un produit précis — le bouton de la ligne. */
  protected async push(product: Product): Promise<void> {
    await this.runPush([product.id]);
  }

  /** Tout le catalogue publiable — le bouton d'entête. */
  protected async pushAll(): Promise<void> {
    await this.runPush(undefined);
  }

  protected categoryName(id: string): string {
    return this.byId().get(id)?.name.fr ?? '—';
  }

  protected inputValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement
      ? target.value
      : '';
  }

  protected async archive(product: Product): Promise<void> {
    await this.run(() => this.api.archiveProduct(product.id));
  }

  protected async remove(product: Product): Promise<void> {
    await this.run(() => this.api.deleteProduct(product.id));
  }

  // ── Actions groupées (sur la sélection) ──────────────────────────────────

  protected async pushSelected(): Promise<void> {
    const ids = this.selectedIds();
    if (ids.length === 0) {
      return;
    }
    await this.runPush(ids);
    this.selection.set(new Set());
  }

  protected async archiveSelected(): Promise<void> {
    await this.batch((id) => this.api.archiveProduct(id));
  }

  protected async deleteSelected(): Promise<void> {
    await this.batch((id) => this.api.deleteProduct(id));
  }

  private async batch(action: (id: string) => Promise<void>): Promise<void> {
    const ids = this.selectedIds();
    if (ids.length === 0) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      for (const id of ids) {
        await action(id);
      }
      await this.reload();
      this.selection.set(new Set());
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private rowChannels(product: Product): SalesChannels {
    const category = this.byId().get(product.categoryId);
    if (category === undefined) {
      return product.channelsOverride ?? NO_CHANNELS;
    }
    return resolveChannels(product, category).channels;
  }

  private async runPush(productIds: string[] | undefined): Promise<void> {
    this.busy.set(true);
    this.pushMessage.set(null);
    try {
      const summary = await this.shopify.push(productIds);
      const pushed = summary.results.filter((r) => r.outcome === 'pushed').length;
      const unchanged = summary.results.filter(
        (r) => r.outcome === 'unchanged',
      ).length;
      const failed = summary.results.filter((r) => r.outcome === 'failed').length;

      // Le mode est rappelé à chaque fois : sans ça on croirait pousser pour de vrai.
      const prefix =
        summary.mode === 'dry-run' ? 'Simulation — ' : 'Envoi réel — ';
      this.pushMessage.set(
        `${prefix}${pushed} poussé(s), ${unchanged} inchangé(s), ${failed} en échec.`,
      );
      this.bindings.set(await this.shopify.listBindings());
    } catch {
      this.pushMessage.set('Envoi impossible : le serveur est injoignable.');
    } finally {
      this.busy.set(false);
    }
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [products, categories, bindings, regimes] = await Promise.all([
        this.api.listProducts(),
        this.api.listCategories(),
        this.shopify.listBindings(),
        this.api.listTvaRegimes(),
      ]);
      this.products.set(products);
      this.bindings.set(bindings);
      this.regimes.set(regimes);
      this.categories.set(categories.filter((category) => !category.isArchived));
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    }
  }
}

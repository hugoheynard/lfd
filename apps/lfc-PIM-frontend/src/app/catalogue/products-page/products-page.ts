import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { RouterLink } from '@angular/router';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldPageLayoutComponent,
  FoldSearchComponent,
  type FoldBadgeVariant,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import {
  boutiquesWith,
  formatPercent,
  generateFiches,
  resolveChannels,
  type GeneratedFiche,
} from '../../data/channels';
import {
  ShopifyApi,
  type ProductBinding,
  type SyncStatus,
} from '../../channels/shopify-api';

import { ChannelMatrix } from '../channel-matrix/channel-matrix';
import {
  CatalogueApi,
  type Category,
  type Product,
  type ProductKind,
  type SalesChannels,
  type TvaRegime,
} from '../catalogue-api';

const KIND_LABELS: Record<ProductKind, string> = {
  daily: 'Frais du jour',
  made_to_order: 'Sur commande',
  resale: 'Revente',
};

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

interface ChannelEdit {
  product: Product;
  category: Category;
  channels: SalesChannels;
  isInherited: boolean;
  fiches: GeneratedFiche[];
}

@Component({
  selector: 'app-products-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ChannelMatrix,
    FoldPageLayoutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldCardComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldSearchComponent,
  ],
  templateUrl: './products-page.html',
  styleUrl: './products-page.scss',
})
export class ProductsPage {
  private readonly api = inject(CatalogueApi);
  private readonly shopify = inject(ShopifyApi);

  protected readonly products = signal<Product[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly bindings = signal<ProductBinding[]>([]);
  protected readonly regimes = signal<TvaRegime[]>([]);
  protected readonly pushMessage = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly query = signal('');

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
    { key: 'kind', label: 'Nature' },
    { key: 'channels', label: 'Canaux', width: '12rem' },
    { key: 'allergens', label: 'Allergènes' },
    { key: 'status', label: 'État' },
    { key: 'sync', label: 'Shopify' },
    { key: 'actions', label: '', align: 'right', width: '12rem' },
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

  /** Le produit en cours d'édition de canaux, résolu + ses fiches. */
  protected readonly channelEdit = computed<ChannelEdit | null>(() => {
    const id = this.editingId();
    if (id === null) {
      return null;
    }
    const product = this.products().find((p) => p.id === id);
    const category = product && this.byId().get(product.categoryId);
    if (product === undefined || category === undefined) {
      return null;
    }
    const resolved = resolveChannels(product, category);
    return {
      product,
      category,
      channels: resolved.channels,
      isInherited: resolved.isInherited,
      fiches: generateFiches(product, category, this.regimeById()),
    };
  });

  constructor() {
    void this.reload();
  }

  protected label(kind: ProductKind): string {
    return KIND_LABELS[kind];
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

  protected editChannels(product: Product): void {
    this.editingId.set(product.id);
  }

  protected closeEditor(): void {
    this.editingId.set(null);
  }

  protected async onChannelsChange(
    product: Product,
    channels: SalesChannels,
  ): Promise<void> {
    await this.run(() => this.api.setProductChannels(product.id, channels));
  }

  protected async onRevert(product: Product): Promise<void> {
    await this.run(() => this.api.setProductChannels(product.id, null));
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

  /**
   * Trois états distincts, et la distinction compte : pas de fiche du tout
   * (bloque la publication), fiche déclarant « aucun », ou liste d'allergènes.
   */
  protected allergenSummary(product: Product): string {
    const codes = product.variants.find((v) => v.isDefault)?.allergens;
    if (codes === null || codes === undefined) {
      return 'non renseignés';
    }
    return codes.length === 0 ? 'aucun (déclaré)' : codes.join(', ');
  }

  protected async rename(product: Product, nameFr: string): Promise<void> {
    if (nameFr.trim() === '' || nameFr === product.name.fr) {
      return;
    }
    await this.run(() => this.api.renameProduct(product.id, nameFr));
  }

  protected async archive(product: Product): Promise<void> {
    await this.run(() => this.api.archiveProduct(product.id));
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

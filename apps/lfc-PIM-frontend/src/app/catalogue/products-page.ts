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
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldPageLayoutComponent,
  type FoldBadgeVariant,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import {
  ShopifyApi,
  type ProductBinding,
  type SyncStatus,
} from '../channels/shopify-api';

import {
  CatalogueApi,
  type Category,
  type Product,
  type ProductKind,
} from './catalogue-api';
import { ProductForm, type NewProductForm } from './product-form';

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

@Component({
  selector: 'app-products-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ProductForm,
    FoldPageLayoutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
  ],
  template: `
    <fold-page-layout icon="grid" title="Produits">
      <p description>
        La référence est <strong>proposée</strong> si on la laisse vide —
        modifiable ensuite. Chaque produit naît avec sa déclinaison par défaut.
      </p>

      <div pageActions>
        @if (categories().length > 0) {
          <button foldButton emphasis="outline" (click)="toggleForm()">
            {{ showForm() ? 'Fermer' : 'Créer un produit' }}
          </button>
        }
        @if (products().length > 0) {
          <button
            foldButton
            emphasis="outline"
            intent="neutral"
            [disabled]="busy()"
            (click)="pushAll()"
          >
            Tout pousser sur Shopify
          </button>
        }
      </div>

      @if (pushMessage(); as text) {
        <fold-callout appearance="inset" variant="info">{{ text }}</fold-callout>
      }
      @if (error(); as message) {
        <fold-callout appearance="inset" variant="alert" role="alert">
          {{ message }}
        </fold-callout>
      }

      @if (categories().length === 0) {
        <fold-callout appearance="inset" variant="warning">
          Créez d'abord une <a routerLink="/familles">famille</a> : un produit
          s'y rattache.
        </fold-callout>
      } @else if (showForm()) {
        <app-product-form
          [categories]="categories()"
          (created)="create($event)"
          (cancelled)="showForm.set(false)"
        />
      }

      <fold-data-table
        [columns]="columns"
        [rows]="products()"
        [rowKey]="rowKey"
        [rowTone]="rowTone"
        zebra
        [empty]="emptyState"
      >
        <ng-template foldCell="sku" let-p>
          <code>{{ p.sku }}</code>
        </ng-template>

        <ng-template foldCell="name" let-p>
          <input
            class="cell-name"
            type="text"
            [value]="p.name.fr"
            aria-label="Nom du produit"
            (change)="rename(p, inputValue($event))"
          />
        </ng-template>

        <ng-template foldCell="category" let-p>
          {{ categoryName(p.categoryId) }}
        </ng-template>

        <ng-template foldCell="kind" let-p>{{ label(p.kind) }}</ng-template>

        <ng-template foldCell="defaultVariant" let-p>
          <code>{{ defaultVariantSku(p) }}</code>
        </ng-template>

        <ng-template foldCell="allergens" let-p>
          @if (allergenSummary(p); as summary) {
            <fold-badge
              [content]="summary"
              [variant]="summary === 'non renseignés' ? 'warning' : 'neutral'"
            />
          }
        </ng-template>

        <ng-template foldCell="status" let-p>
          <fold-badge
            [content]="p.status"
            [variant]="p.status === 'archived' ? 'neutral' : 'success'"
          />
        </ng-template>

        <ng-template foldCell="sync" let-p>
          <fold-badge [content]="syncLabel(p.id)" [variant]="syncVariant(p.id)" />
        </ng-template>

        <ng-template foldCell="actions" let-p>
          <div class="row-actions">
            <button
              foldButton
              emphasis="outline"
              size="sm"
              [disabled]="busy()"
              (click)="push(p)"
            >
              Pousser
            </button>
            @if (p.status !== 'archived') {
              <button
                foldButton
                emphasis="soft"
                intent="neutral"
                size="sm"
                (click)="archive(p)"
              >
                Archiver
              </button>
            }
          </div>
        </ng-template>
      </fold-data-table>
    </fold-page-layout>
  `,
  styles: [
    `
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.85em;
      }

      .cell-name {
        width: 100%;
        min-width: 8rem;
        padding: 0.35rem 0.5rem;
        font: inherit;
        color: inherit;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--fold-radius-sm, 6px);
      }

      .cell-name:hover,
      .cell-name:focus-visible {
        background: var(--fold-color-surface-sunken);
        border-color: var(--fold-color-border);
        outline: none;
      }

      .row-actions {
        display: flex;
        gap: 0.4rem;
        justify-content: flex-end;
        white-space: nowrap;
      }
    `,
  ],
})
export class ProductsPage {
  private readonly api = inject(CatalogueApi);
  private readonly shopify = inject(ShopifyApi);

  protected readonly products = signal<Product[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly showForm = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly bindings = signal<ProductBinding[]>([]);
  protected readonly pushMessage = signal<string | null>(null);

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'sku', label: 'Référence', width: '9rem' },
    { key: 'name', label: 'Nom' },
    { key: 'category', label: 'Famille' },
    { key: 'kind', label: 'Nature' },
    { key: 'defaultVariant', label: 'Déclinaison' },
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

  protected defaultVariantSku(product: Product): string {
    return product.variants.find((variant) => variant.isDefault)?.sku ?? '—';
  }

  protected inputValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement
      ? target.value
      : '';
  }

  protected toggleForm(): void {
    this.showForm.update((open) => !open);
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

  protected async create(form: NewProductForm): Promise<void> {
    await this.run(async () => {
      await this.api.createProduct(form);
      this.showForm.set(false);
    });
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
      const [products, categories, bindings] = await Promise.all([
        this.api.listProducts(),
        this.api.listCategories(),
        this.shopify.listBindings(),
      ]);
      this.products.set(products);
      this.bindings.set(bindings);
      this.categories.set(categories.filter((category) => !category.isArchived));
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    }
  }
}

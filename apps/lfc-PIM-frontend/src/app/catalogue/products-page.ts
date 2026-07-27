import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { RouterLink } from '@angular/router';

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

@Component({
  selector: 'app-products-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ProductForm],
  template: `
    <header class="page-head">
      <div class="head-row">
        <h1>Produits</h1>
        <div class="head-actions">
          @if (categories().length > 0) {
            <button type="button" (click)="toggleForm()">
              {{ showForm() ? 'Fermer' : 'Créer un produit' }}
            </button>
          }
          @if (products().length > 0) {
            <button type="button" class="ghost" (click)="pushAll()" [disabled]="busy()">
              Tout pousser sur Shopify
            </button>
          }
        </div>
      </div>
      <p>
        La référence est <strong>proposée</strong> si on la laisse vide — modifiable
        ensuite. Chaque produit naît avec sa déclinaison par défaut.
      </p>
    </header>

    @if (pushMessage(); as text) {
      <p class="notice" role="status">{{ text }}</p>
    }

    @if (categories().length === 0) {
      <p class="empty">
        Créez d’abord une <a routerLink="/familles">famille</a> : un produit s’y rattache.
      </p>
    } @else {
      @if (showForm()) {
        <app-product-form
          [categories]="categories()"
          (created)="create($event)"
          (cancelled)="showForm.set(false)"
        />
      }
    }

    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (products().length > 0) {
      <table>
        <thead>
          <tr>
            <th>Référence</th>
            <th>Nom</th>
            <th>Famille</th>
            <th>Nature</th>
            <th>Déclinaison par défaut</th>
            <th>Allergènes</th>
            <th>État</th>
            <th>Shopify</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (product of products(); track product.id) {
            <tr [class.archived]="product.status === 'archived'">
              <td><code>{{ product.sku }}</code></td>
              <td>
                <input
                  type="text"
                  [value]="product.name.fr"
                  (change)="rename(product, inputValue($event))"
                />
              </td>
              <td>{{ categoryName(product.categoryId) }}</td>
              <td>{{ label(product.kind) }}</td>
              <td><code>{{ defaultVariantSku(product) }}</code></td>
              <td>
                @if (allergenSummary(product); as summary) {
                  <span class="tag" [class.warn]="summary === 'non renseignés'">
                    {{ summary }}
                  </span>
                }
              </td>
              <td><span class="tag">{{ product.status }}</span></td>
              <td>
                <span class="tag" [class.warn]="syncStatus(product.id) === 'failed'">
                  {{ syncLabel(product.id) }}
                </span>
              </td>
              <td class="row-actions">
                <button type="button" class="ghost" (click)="push(product)" [disabled]="busy()">
                  Pousser
                </button>
                @if (product.status !== 'archived') {
                  <button type="button" class="ghost" (click)="archive(product)">Archiver</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styleUrl: './catalogue.scss',
  styles: [
    `
      .head-actions {
        display: flex;
        gap: 0.5rem;
      }
      .head-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .row-actions {
        display: flex;
        gap: 0.4rem;
        white-space: nowrap;
      }
      .tag.warn {
        color: var(--fold-color-alert);
      }
      .notice {
        padding: 0.6rem 0.8rem;
        margin-bottom: 1rem;
        background: var(--fold-color-surface-sunken);
        border-radius: 0.4rem;
        font-size: 0.9rem;
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

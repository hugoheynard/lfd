import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { RouterLink } from '@angular/router';

import {
  CatalogueApi,
  type Category,
  type Product,
  type ProductKind,
} from './catalogue-api';

const KIND_LABELS: Record<ProductKind, string> = {
  daily: 'Frais du jour',
  made_to_order: 'Sur commande',
  resale: 'Revente',
};

@Component({
  selector: 'app-products-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <header class="page-head">
      <h1>Produits</h1>
      <p>
        La référence est <strong>proposée</strong> si on la laisse vide — modifiable
        ensuite. Chaque produit naît avec sa déclinaison par défaut.
      </p>
    </header>

    @if (categories().length === 0) {
      <p class="empty">
        Créez d’abord une <a routerLink="/familles">famille</a> : un produit s’y rattache.
      </p>
    } @else {
      <form class="row-form" (submit)="create($event)">
        <input
          type="text"
          placeholder="Nom du produit — ex. Tarte aux fraises"
          [value]="draftName()"
          (input)="draftName.set(inputValue($event))"
          required
        />
        <select [value]="draftCategory()" (change)="draftCategory.set(inputValue($event))">
          @for (category of categories(); track category.id) {
            <option [value]="category.id">{{ category.name.fr }}</option>
          }
        </select>
        <select [value]="draftKind()" (change)="draftKind.set(inputValue($event))">
          @for (kind of kinds; track kind) {
            <option [value]="kind">{{ label(kind) }}</option>
          }
        </select>
        <input
          type="text"
          class="sku"
          placeholder="Référence (optionnelle)"
          [value]="draftSku()"
          (input)="draftSku.set(inputValue($event))"
        />
        <button type="submit" [disabled]="busy()">Ajouter</button>
      </form>
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
            <th>État</th>
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
              <td><span class="tag">{{ product.status }}</span></td>
              <td>
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
})
export class ProductsPage {
  private readonly api = inject(CatalogueApi);

  protected readonly kinds: readonly ProductKind[] = [
    'daily',
    'made_to_order',
    'resale',
  ];

  protected readonly products = signal<Product[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly draftName = signal('');
  protected readonly draftCategory = signal('');
  protected readonly draftKind = signal<string>('daily');
  protected readonly draftSku = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  private readonly byId = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  constructor() {
    void this.reload();
  }

  protected label(kind: string): string {
    return this.isKind(kind) ? KIND_LABELS[kind] : kind;
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

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    const nameFr = this.draftName().trim();
    const categoryId = this.draftCategory();
    const kind = this.draftKind();

    if (nameFr === '' || categoryId === '' || !this.isKind(kind)) {
      return;
    }

    const sku = this.draftSku().trim();
    await this.run(async () => {
      await this.api.createProduct(
        sku === ''
          ? { nameFr, kind, categoryId }
          : { nameFr, kind, categoryId, sku },
      );
      this.draftName.set('');
      this.draftSku.set('');
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

  private isKind(value: string): value is ProductKind {
    return value === 'daily' || value === 'made_to_order' || value === 'resale';
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
      const [products, categories] = await Promise.all([
        this.api.listProducts(),
        this.api.listCategories(),
      ]);
      this.products.set(products);
      this.categories.set(categories.filter((category) => !category.isArchived));

      if (this.draftCategory() === '' && categories.length > 0) {
        this.draftCategory.set(categories[0]?.id ?? '');
      }
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    }
  }
}

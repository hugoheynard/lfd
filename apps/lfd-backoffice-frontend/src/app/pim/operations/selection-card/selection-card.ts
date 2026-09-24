import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { OperationView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import type { CatalogProduct } from '../../../contenu/storefront-catalog';
import { StorefrontProductPicker } from '../../../contenu/storefront-product-picker/storefront-product-picker';
import { ProductHttpApi } from '../../catalogue/product-http-api';
import type { Product } from '../../data/models';
import { refusalOf } from '../operation-format';
import { moved, sameOrder, withoutSku, withSku } from '../selection-order';
import { OperationsService } from '../operations.service';

/** Une ligne de la sélection : la référence, et ce que le catalogue en dit. */
interface SelectionRow {
  readonly sku: string;
  /** `null` : le catalogue n'a pas été lu, ou ne connaît plus cette référence. */
  readonly name: string | null;
  /** La fiche est « vendue seulement pendant une opération » (D3). */
  readonly operationOnly: boolean;
}

/**
 * Les articles du référentiel, une ligne par DÉCLINAISON : une opération
 * sélectionne des SKU, et c'est la déclinaison qui en porte un (le serveur les
 * vérifie contre les déclinaisons, `prisma-operation-sku.catalogue.ts`, lu le
 * 2026-09-24). Le nom de la déclinaison ne s'ajoute que s'il y en a plusieurs.
 */
export function selectableOf(products: readonly Product[]): readonly CatalogProduct[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      sku: variant.sku,
      name:
        product.variants.length > 1 ? `${product.name.fr} — ${variant.name.fr}` : product.name.fr,
      shelf: product.categoryId,
    })),
  );
}

/** Les SKU dont la fiche est « vendue seulement pendant une opération ». */
export function operationOnlySkusOf(products: readonly Product[]): ReadonlySet<string> {
  return new Set(
    products
      .filter((product) => product.operationOnly)
      .flatMap((product) => product.variants.map((variant) => variant.sku)),
  );
}

/**
 * **Sélection d'articles** — ordonnée, réécrite en entier à l'enregistrement.
 *
 * Sélectionner un article ne le retire d'aucun rayon : c'est la case « Vendu
 * seulement pendant une opération » de sa FICHE qui le réserve (D3). La carte
 * le dit donc article par article, sans requête de plus — la liste du
 * catalogue qu'elle lit déjà porte le drapeau.
 */
@Component({
  selector: 'app-selection-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    StorefrontProductPicker,
  ],
  templateUrl: './selection-card.html',
  styleUrl: './selection-card.scss',
})
export class SelectionCard {
  private readonly api = inject(OperationsService);
  private readonly products = inject(ProductHttpApi);

  readonly operation = input.required<OperationView>();
  readonly locked = input(false);
  readonly saved = output<string>();

  protected readonly catalogue = signal<readonly CatalogProduct[]>([]);
  private readonly operationOnlySkus = signal<ReadonlySet<string>>(new Set());
  protected readonly catalogueFailed = signal(false);
  protected readonly skus = signal<readonly string[]>([]);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly rows = computed<readonly SelectionRow[]>(() => {
    const names = new Map(this.catalogue().map((item) => [item.sku, item.name]));
    const reserved = this.operationOnlySkus();
    return this.skus().map((sku) => ({
      sku,
      name: names.get(sku) ?? null,
      operationOnly: reserved.has(sku),
    }));
  });

  protected readonly changed = computed(() => !sameOrder(this.skus(), this.operation().skus));

  constructor() {
    effect(() => {
      this.skus.set(this.operation().skus);
    });
    void this.loadCatalogue();
  }

  protected add(sku: string): void {
    this.skus.update((skus) => withSku(skus, sku));
  }

  protected remove(sku: string): void {
    this.skus.update((skus) => withoutSku(skus, sku));
  }

  protected move(index: number, step: -1 | 1): void {
    this.skus.update((skus) => moved(skus, index, step));
  }

  protected async save(): Promise<void> {
    if (this.locked()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.api.setSelection(this.operation().key, this.skus());
      this.saved.emit('Sélection enregistrée.');
    } catch (error) {
      this.refusal.set(refusalOf(error, "La sélection n'a pas pu être enregistrée."));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadCatalogue(): Promise<void> {
    try {
      const products = await this.products.list();
      this.catalogue.set(selectableOf(products));
      this.operationOnlySkus.set(operationOnlySkusOf(products));
    } catch {
      this.catalogueFailed.set(true);
    }
  }
}

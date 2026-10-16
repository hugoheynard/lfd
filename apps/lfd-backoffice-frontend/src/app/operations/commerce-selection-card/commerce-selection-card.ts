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
import type { CatalogAdminItemView, CommerceOperationView } from '@lfd/contracts';
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

import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import type { CatalogProduct } from '../../contenu/storefront-catalog';
import { StorefrontProductPicker } from '../../contenu/storefront-product-picker/storefront-product-picker';
import { refusalOf } from '../commerce-operation-format';
import { CommerceOperationsService } from '../commerce-operations.service';
import { moved, sameOrder, withoutSku, withSku } from '../selection-order';

/** Une ligne de la sélection : la référence, et ce que le commerce en dit. */
interface SelectionRow {
  readonly sku: string;
  /** `null` : le catalogue n'a pas été lu, ou ne connaît pas cette référence. */
  readonly name: string | null;
  /** L'article est « vendu seulement pendant une opération » — réglé au référentiel. */
  readonly operationOnly: boolean;
  /**
   * Enregistrée dans la sélection et pas en vente, selon le serveur. Un ajout
   * pas encore enregistré n'en dit rien : le serveur ne l'a pas encore lu.
   */
  readonly notSelling: boolean;
}

/**
 * Les articles du commerce qu'une sélection peut désigner : une ligne par
 * SKU d'article (`catalog_items`), ceux que le serveur vérifie (O2 du plan,
 * `prisma-operation-sku.catalogue.ts`, lu le 2026-10-16). La famille sert de
 * rayon au sélecteur.
 */
export function selectableOf(
  items: readonly Pick<CatalogAdminItemView, 'sku' | 'name' | 'categoryId'>[],
): readonly CatalogProduct[] {
  return items.map((item) => ({ sku: item.sku, name: item.name, shelf: item.categoryId }));
}

/**
 * **Sélection d'articles** — choisie dans le catalogue DU COMMERCE (O2),
 * ordonnée, réécrite en entier à l'enregistrement.
 *
 * Sélectionner un article ne le retire d'aucun rayon : l'exclusivité
 * (« vendu seulement pendant une opération ») est une propriété de
 * l'article, réglée au référentiel. La carte la dit, ligne par ligne.
 */
@Component({
  selector: 'app-commerce-selection-card',
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
  templateUrl: './commerce-selection-card.html',
  styleUrl: './commerce-selection-card.scss',
})
export class CommerceSelectionCard {
  private readonly api = inject(CommerceOperationsService);
  private readonly catalogueApi = inject(CatalogueService);

  readonly operation = input.required<CommerceOperationView>();
  readonly locked = input(false);
  readonly saved = output<string>();

  private readonly items = signal<readonly CatalogAdminItemView[]>([]);
  protected readonly catalogue = computed(() => selectableOf(this.items()));
  protected readonly catalogueFailed = signal(false);
  protected readonly skus = signal<readonly string[]>([]);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly rows = computed<readonly SelectionRow[]>(() => {
    const known = new Map(this.items().map((item) => [item.sku, item]));
    const stored = new Set(this.operation().skus);
    const selling = new Set(this.operation().sellingSkus);
    return this.skus().map((sku) => ({
      sku,
      name: known.get(sku)?.name ?? null,
      operationOnly: known.get(sku)?.operationOnly ?? false,
      notSelling: stored.has(sku) && !selling.has(sku),
    }));
  });

  protected readonly subtitle = computed(() => {
    const operation = this.operation();
    return (
      `${String(operation.sellingSkus.length)} en vente sur ${String(operation.skus.length)}, ` +
      "dans l'ordre où le rayon de l'opération les montrera."
    );
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
      this.items.set(await this.catalogueApi.list());
    } catch {
      this.catalogueFailed.set(true);
    }
  }
}

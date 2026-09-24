import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldListboxComponent, FoldSearchComponent } from 'fold-ng';

import { type CatalogProduct, searchProducts } from '../storefront-catalog';

/** Au-delà, la liste déroulante ne se lit plus : on affine la recherche. */
const MAX_MATCHES = 50;

/**
 * Choisir l'article d'un contenu **produit** : une recherche par nom ou par
 * SKU, puis la liste de ce qui correspond.
 *
 * Il ne rend QUE le SKU du produit (D4) : la boutique le résout dans son
 * catalogue, et recopier un nom ou un prix les ferait dériver.
 */
@Component({
  selector: 'app-storefront-product-picker',
  imports: [FoldListboxComponent, FoldSearchComponent],
  templateUrl: './storefront-product-picker.html',
  styleUrl: './storefront-product-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontProductPicker {
  readonly products = input.required<readonly CatalogProduct[]>();
  /** Le SKU déjà désigné, s'il y en a un. */
  readonly sku = input<string | null>(null);
  readonly picked = output<string>();

  protected readonly query = signal('');

  protected readonly matches = computed(() => searchProducts(this.products(), this.query()));

  /** Les options de la liste : l'article déjà désigné y reste, même hors de la recherche. */
  protected readonly options = computed(() => {
    const shown = this.matches().slice(0, MAX_MATCHES);
    const current = this.products().find((product) => product.sku === this.sku());
    const withCurrent =
      current === undefined || shown.includes(current) ? shown : [current, ...shown];
    return withCurrent.map((product) => ({
      value: product.sku,
      label: `${product.name} · ${product.sku}`,
    }));
  });

  protected readonly hint = computed(() => {
    const count = this.matches().length;
    if (count === 0) {
      return 'Aucun article en vente ne correspond.';
    }
    return count > MAX_MATCHES
      ? `${count} articles correspondent : les ${MAX_MATCHES} premiers sont listés, affinez la recherche.`
      : `${count} article${count > 1 ? 's' : ''} en vente.`;
  });
}

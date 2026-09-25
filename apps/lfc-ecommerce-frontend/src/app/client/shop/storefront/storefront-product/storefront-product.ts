import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { PublicStorefrontContent } from '@lfd/contracts';
import type { MediaFit, MediaSide, StorefrontShape, StorefrontTone } from '@lfd/storefront-layout';

import { ClientCart } from '../../../cart/client-cart.service';
import { ClientFeatureAccess } from '../../../feature-access/client-feature-access.service';
import { ProductTile } from '../../product-tile/product-tile';
import { ShopCatalogue } from '../../shop-catalogue.store';
import { StorefrontActions } from '../storefront-actions';
import type { StorefrontRenderer } from '../storefront-renderers';

/**
 * **Un contenu produit, dans une case de vitrine** — l'entrée `product` du
 * registre.
 *
 * Le contenu ne porte QUE le SKU (D4) : ce composant le résout dans le
 * catalogue déjà chargé, puis rend la vignette du rayon, {@link ProductTile},
 * à la forme de sa case. Il n'ajoute rien d'autre : le panier et la fiche
 * passent par la grille, comme pour les cases du reste du rayon.
 *
 * Un SKU que le catalogue ne sert plus n'arrive pas ici — la composition l'a
 * écarté ; le `@if` du gabarit ne couvre que l'instant où le catalogue
 * changerait de lecteur sous la grille.
 */
@Component({
  selector: 'app-storefront-product',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductTile],
  templateUrl: './storefront-product.html',
  styleUrl: './storefront-product.scss',
})
export class StorefrontProduct implements StorefrontRenderer {
  readonly content = input.required<PublicStorefrontContent>();
  readonly shape = input.required<StorefrontShape>();
  readonly mediaFit = input.required<MediaFit>();
  readonly mediaSide = input.required<MediaSide>();
  readonly tone = input.required<StorefrontTone>();

  private readonly catalogue = inject(ShopCatalogue);
  protected readonly cart = inject(ClientCart);
  protected readonly access = inject(ClientFeatureAccess);
  protected readonly actions = inject(StorefrontActions);

  protected readonly item = computed(() => {
    const content = this.content();
    return content.kind === 'product' ? this.catalogue.itemOf(content.sku) : null;
  });
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { outputFromObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { PublicStorefrontPageView, ShopItemView } from '@lfd/contracts';
import {
  composeShelf,
  GRID_COLUMNS,
  hasComposedObject,
  MOBILE_COLUMNS,
} from '@lfd/storefront-layout';

import { ClientCart } from '../../../cart/client-cart.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { ClientFeatureAccess } from '../../../feature-access/client-feature-access.service';
import { ProductTile } from '../../product-tile/product-tile';
import { ShopCatalogue } from '../../shop-catalogue.store';
import { StorefrontActions } from '../../storefront/storefront-actions';
import { StorefrontSlot } from '../../storefront/storefront-slot/storefront-slot';

/**
 * **La vitrine** — les pièces d'un rayon, ou ce qu'il faut lire quand il n'y en
 * a aucune.
 *
 * ## Deux rendus, choisis par la page du rayon
 *
 * - **Composée** (`plan-vitrine-enregistrement.md`, D10) : la page du rayon
 *   pose au moins un objet affichable. `composeShelf` du paquet
 *   `@lfd/storefront-layout` rend des cases résolues, et la grille les pose
 *   par variables CSS — sa place au bureau ET dans la pile, dans le même DOM :
 *   le serveur ne connaît pas la largeur, c'est le CSS qui choisit.
 * - **Le rayon d'aujourd'hui** : pas de page, une page sans objet, ou la
 *   vitrine injoignable. Les pièces s'écoulent en cartes, et le best-seller
 *   est celui que le catalogue marque (`isFeatured`), sur deux colonnes.
 *   🔴 C'est aussi le repli de la panne : jamais d'écran vide.
 *
 * Elle prend le panier elle-même. Ajouter et retirer sont des gestes de la
 * VITRINE — la quantité s'affiche sur la pièce, à côté du bouton qui la change —
 * et les faire remonter à la page pour qu'elle les redescende n'aurait ajouté
 * que deux relais. Ce qu'elle ne fait pas, c'est ouvrir la fiche : la feuille
 * est un état de l'écran, pas de la grille.
 *
 * Les rendus du registre sont créés par `NgComponentOutlet`, qui ne branche
 * pas d'`output()` : leurs gestes remontent par {@link StorefrontActions},
 * fourni ici — et les cartes du reste du rayon passent par le même relais.
 */
@Component({
  selector: 'app-shelf-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductTile, StorefrontSlot],
  providers: [StorefrontActions],
  host: { '[class.composed]': 'cells() !== null' },
  templateUrl: './shelf-grid.html',
  styleUrl: './shelf-grid.scss',
})
export class ShelfGrid {
  readonly products = input.required<readonly ShopItemView[]>();

  /**
   * La page de vitrine du rayon, ou `null` — pendant une recherche, ou quand
   * la vitrine n'a pas répondu. C'est la PAGE (l'écran) qui la choisit : la
   * grille ne sait pas quel rayon elle affiche.
   */
  readonly page = input<PublicStorefrontPageView | null>(null);

  protected readonly actions = inject(StorefrontActions);

  /** La pièce dont on veut la fiche. */
  readonly opened = outputFromObservable(this.actions.productOpened);

  /** Le rayon qu'ouvre une annonce. */
  readonly shelfOpened = outputFromObservable(this.actions.shelfOpened);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
  /** Au niveau `browse` exactement, le rayon se visite sans panier (plan §4). */
  protected readonly access = inject(ClientFeatureAccess);
  private readonly catalogue = inject(ShopCatalogue);

  /** Ce que le catalogue sert — un objet peut montrer un article d'un autre rayon. */
  private readonly served = computed(() => new Set(this.catalogue.items().map((item) => item.sku)));

  protected readonly bySku = computed(
    () => new Map(this.products().map((item) => [item.sku, item])),
  );

  /**
   * Les cases composées, ou `null` pour le rayon d'aujourd'hui. Une page qui ne
   * pose aucun objet affichable EST le rayon d'aujourd'hui
   * (`boutique-rayon-layout.md`) : elle garde son best-seller `isFeatured`.
   */
  protected readonly cells = computed(() => {
    const page = this.page();
    if (page === null) {
      return null;
    }
    const cells = composeShelf(
      page,
      this.products().map((item) => item.sku),
      this.served(),
    );
    return hasComposedObject(cells) ? cells : null;
  });

  /** Une case pleine largeur au bureau reste pleine largeur quand la grille perd des colonnes. */
  protected readonly fullWidth = GRID_COLUMNS;
  protected readonly pileWidth = MOBILE_COLUMNS;

  constructor() {
    this.actions.productAdded.pipe(takeUntilDestroyed()).subscribe((sku) => {
      this.cart.add(sku);
    });
  }
}

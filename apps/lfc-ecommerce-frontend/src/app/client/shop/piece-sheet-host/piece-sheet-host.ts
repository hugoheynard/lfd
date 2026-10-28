import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import { ClientCart } from '../../cart/client-cart.service';
import { ProductAudience } from '../../audience/product-audience.service';
import { PieceQuantity } from '../piece-quantity.service';
import { PieceRequest } from '../piece-request.service';
import { ProductSheet } from '../product-sheet/product-sheet';
import { ShopCatalogue } from '../shop-catalogue.store';

/**
 * **La fiche d'un article, ouverte hors de la boutique** (Hugo, 2026-10-28 :
 * un incontournable de « Bienvenue » ouvrait sa fiche… en menant à la
 * boutique en arrière-plan).
 *
 * Posé sur une page, il prend les demandes de {@link PieceRequest} à la place
 * de la boutique : tant qu'il est là, demander une fiche ne navigue pas. La
 * fiche n'a pas d'adresse ici — fermer rend la page telle qu'elle était.
 */
@Component({
  selector: 'app-piece-sheet-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductSheet],
  templateUrl: './piece-sheet-host.html',
})
export class PieceSheetHost {
  private readonly catalogue = inject(ShopCatalogue);
  private readonly cart = inject(ClientCart);
  private readonly quantities = inject(PieceQuantity);

  private readonly sku = signal<string | null>(null);

  protected readonly piece = computed(() => {
    const id = this.sku();
    return id === null ? null : this.catalogue.itemOf(id);
  });

  protected readonly quantity = computed(() => {
    const id = this.sku();
    return id === null ? 0 : this.cart.quantityOf(id);
  });

  constructor() {
    const pieces = inject(PieceRequest);
    inject(DestroyRef).onDestroy(pieces.attach());
    const audience = inject(ProductAudience);
    effect(() => {
      pieces.latest();
      const sku = untracked(() => pieces.take());
      if (sku !== null) {
        this.sku.set(sku);
        // La vue d'une fiche est comptée à son ouverture, comme en boutique.
        untracked(() => audience.record(sku, 'product_viewed'));
      }
    });
  }

  protected close(): void {
    this.sku.set(null);
  }

  protected setQuantity(quantity: number): void {
    const id = this.sku();
    if (id !== null && this.quantities.set(id, quantity)) {
      this.close();
    }
  }
}

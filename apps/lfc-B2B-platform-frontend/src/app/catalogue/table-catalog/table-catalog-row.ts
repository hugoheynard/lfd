import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';

import { FoldButtonComponent, FoldNumberInputComponent } from 'fold-ng';

import type { FoldProduct, FoldProductOrder } from '../../../shared';
import { CartService } from '../../data/cart.service';

/**
 * Une ligne de l'order-pad ({@link TableCatalog}) — un `<tr>`-composant qui porte
 * sa propre quantité (stepper au pas du colisage) et remonte l'ajout. Pensé pour
 * la saisie rapide clavier de haut en bas.
 */
@Component({
  selector: 'tr[appTableCatalogRow]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldNumberInputComponent, FoldButtonComponent],
  templateUrl: './table-catalog-row.html',
  styleUrl: './table-catalog-row.scss',
})
export class TableCatalogRow {
  readonly product = input.required<FoldProduct>();

  readonly add = output<FoldProductOrder>();
  readonly notify = output<FoldProduct>();

  private readonly cart = inject(CartService);

  readonly isOut = computed(() => this.product().outOfStock === true);
  /** Combien déjà au panier (réactif). */
  readonly inCart = computed(() => this.cart.qtyOf(this.product().id));

  /** Pas de commande (colisage / PCB) ; 1 = unité libre. */
  readonly step = computed(() => this.product().step ?? 1);
  readonly minQty = computed(() => this.step());

  /** Le conditionnement affiché : le libellé de colis, sinon « À l'unité ». */
  readonly conditioning = computed(() => this.product().packLabel ?? "À l'unité");

  /** Quantité de la ligne — se recale sur le minimum quand le produit change. */
  readonly quantity = linkedSignal(() => this.minQty());

  emitAdd(): void {
    this.add.emit({ product: this.product(), quantity: this.quantity() });
  }
}

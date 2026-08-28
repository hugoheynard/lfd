import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { formatEuro } from '../../../client/cart-total';
import { ClientDialog } from '../../../client/dialog/client-dialog';
import { ClientOrder } from '../../../client/client-order.service';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { categoryOf, ovenHoursOf, type ShopProduct } from '../../../client/mock-shop';

/**
 * La fiche d'une pièce — le geste LENT du rayon.
 *
 * Elle répond à ce que la vignette ne peut pas dire à 112 px : le nom entier, la
 * note du fournil, et trois faits qui décident vraiment — ce que ça coûte à
 * l'unité, quand ça sort du four, où ça vous attend. Le stepper y fait 44 px
 * parce que c'est ici, et pas dans la grille, qu'on RETIRE.
 */
@Component({
  selector: 'app-product-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog, FoldIconComponent],
  templateUrl: './product-sheet.html',
  styleUrl: './product-sheet.scss',
})
export class ProductSheet {
  /** `null` ferme la feuille : il n'y a pas de fiche sans pièce à montrer. */
  readonly product = input.required<ShopProduct | null>();

  readonly quantity = input(0);

  readonly closed = output<void>();
  readonly added = output<void>();
  readonly removed = output<void>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly order = inject(ClientOrder);

  protected readonly shelf = computed(() => {
    const product = this.product();
    return product === null ? '' : (categoryOf(product)?.label ?? '');
  });

  /**
   * Les trois faits. Le troisième dit où la pièce vous attend : il vient du mode
   * de service, pas du produit — la même viennoiserie se retire ou se livre.
   */
  protected readonly facts = computed(() => {
    const product = this.product();
    const c = this.t().product;
    if (!product) {
      return [];
    }
    const choice = this.order.choice();
    const where =
      choice === null
        ? { key: c.pickupAt, value: '—' }
        : {
            key: choice.mode === 'pickup' ? c.pickupAt : c.deliverTo,
            value: `${choice.place} · ${choice.slot}`,
          };
    return [
      { key: c.unitPrice, value: formatEuro(product.price) },
      { key: c.oven, value: ovenHoursOf(product.category) },
      where,
    ];
  });

  protected readonly addLabel = computed(() =>
    fill(this.t().shop.addAria, { name: this.product()?.name ?? '' }),
  );

  protected readonly removeLabel = computed(() =>
    fill(this.t().shop.removeAria, { name: this.product()?.name ?? '' }),
  );

  /** Le bouton porte le prix de ce qu'on emporte, pas celui de l'unité. */
  protected readonly cta = computed(() => {
    const product = this.product();
    if (!product) {
      return '';
    }
    const pieces = Math.max(this.quantity(), 1);
    return fill(this.t().product.cta, { price: formatEuro(product.price * pieces) });
  });
}

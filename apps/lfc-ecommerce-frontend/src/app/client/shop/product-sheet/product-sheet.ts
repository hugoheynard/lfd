import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { formatCents } from '../../../client/format-money';
import { ClientDialog } from '../../../client/dialog/client-dialog';
import { OrderContextStore } from '../../../client/order-context.store';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import type { ShopItemView } from '@lfd/contracts';
import { lineTotalCents, unitPriceCents } from '@lfd/money';

import { artOf, ovenHoursOf } from '../shelf-display';
import { mediaSrcset, sizedMedia, SHEET_WIDTHS } from '../media-source';
import { ShopCatalogue } from '../shop-catalogue.store';
import { ShopPriceBasis } from '../shop-price-basis.service';
import { QuantityRail } from '../quantity-rail/quantity-rail';

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
  imports: [ClientDialog, QuantityRail],
  templateUrl: './product-sheet.html',
  styleUrl: './product-sheet.scss',
})
export class ProductSheet {
  /** `null` ferme la feuille : il n'y a pas de fiche sans pièce à montrer. */
  readonly product = input.required<ShopItemView | null>();

  readonly quantity = input(0);

  /**
   * La boutique permet-elle d'ajouter au panier ? Faux au niveau `browse` (plan
   * `plan-inscription-pro-seule.md` §4) : le pied de la fiche porte alors la
   * mention à la place du stepper et du bouton.
   */
  readonly orderable = input(true);

  readonly closed = output<void>();
  readonly added = output<void>();
  readonly removed = output<void>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly order = inject(OrderContextStore);
  private readonly basis = inject(ShopPriceBasis);

  private readonly catalogue = inject(ShopCatalogue);

  /** Le nom du rayon vient du CATALOGUE : c'est lui qui range, pas cet écran. */
  protected readonly shelf = computed(() => {
    const product = this.product();
    if (product === null) {
      return '';
    }
    return this.catalogue.shelves().find((shelf) => shelf.id === product.shelfId)?.name ?? '';
  });

  /**
   * L'ouverture, à la largeur de la fiche.
   *
   * Plus grande que la tuile — elle occupe toute la largeur du panneau — donc
   * ses largeurs sont doublées. Mesuré : 123 ko à 1800 px, contre 3,64 Mo pour
   * le master.
   */
  protected readonly artSrc = computed(() => {
    const visual = this.art();
    return visual === null ? '' : sizedMedia(visual.url, SHEET_WIDTHS[0]);
  });

  protected readonly artSrcset = computed(() => {
    const visual = this.art();
    return visual === null ? '' : mediaSrcset(visual.url, SHEET_WIDTHS);
  });

  protected readonly art = computed(() => {
    const product = this.product();
    return product === null ? null : artOf(product);
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
      {
        key: c.unitPrice,
        // La fiche suit la vignette : même assiette, même mention. Les voir
        // différer d'un écran à l'autre ferait douter du prix lui-même.
        value: this.basis.showsTtc()
          ? fill(this.t().shop.priceTtc, { price: formatCents(product.unitPriceTtcCents) })
          : fill(this.t().shop.priceHt, {
              price: formatCents(unitPriceCents(product.unitPriceMillicents)),
            }),
      },
      { key: c.oven, value: ovenHoursOf(product.shelfId) },
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
    return fill(this.t().product.cta, {
      price: fill(this.t().shop.priceHt, {
        price: formatCents(lineTotalCents(product.unitPriceMillicents, pieces)),
      }),
    });
  });
}

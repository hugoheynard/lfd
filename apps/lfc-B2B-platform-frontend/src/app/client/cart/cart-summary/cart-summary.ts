import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { formatCents, formatRate } from '../../format-money';
import { CartUpsell } from '../cart-upsell.service';
import { ClientCart } from '../client-cart.service';
import { OrderContextStore } from '../../order-context.store';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { unitPriceCents } from '@lfd/money';

import { lineHtCents } from '../cart-total';

/**
 * Le décompte du panier : les lignes, la relance, la remise, la TVA, le total.
 *
 * Un seul composant pour les deux plis — la colonne de droite du bureau et
 * l'écran de panier du téléphone montrent la MÊME chose, et la montrer deux fois
 * serait deux occasions de diverger.
 *
 * Trois règles y sont visibles, et elles viennent du handoff :
 *
 * - la remise porte le complément du lieu (« au Labo »), jamais son nom brut ;
 * - une ligne de TVA n'existe que si son taux est au panier — et il en faut
 *   une PAR TAUX : c'est ce qu'une facture porte, un total ne suffit pas ;
 * - il n'y a PAS de ligne « retrait · offert » — le retrait est toujours
 *   gratuit, la ligne ne dirait rien. Les frais n'apparaissent qu'en coursier.
 */
@Component({
  selector: 'app-cart-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './cart-summary.html',
  styleUrl: './cart-summary.scss',
})
export class CartSummary {
  /** Le décompte seul, sans les lignes : la confirmation n'a plus à les lister. */
  readonly linesShown = input(true);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
  private readonly upsell = inject(CartUpsell);
  private readonly order = inject(OrderContextStore);

  protected readonly totals = this.cart.totals;

  protected readonly lines = computed(() =>
    this.cart.lines().map((line) => ({
      id: line.product.sku,
      quantity: line.quantity,
      name: line.product.name,
      // Le prix unitaire porte la mention : c'est le seul montant de la liste
      // qu'on lirait spontanément TTC. Les totaux, eux, sont couverts par le
      // « Sous-total HT » qui les suit.
      unit: fill(this.t().shop.priceHt, {
        price: formatCents(unitPriceCents(line.product.unitPriceMillicents)),
      }),
      // L'arrondi a lieu au TOTAL de ligne, jamais sur l'unité multipliée : deux
      // fois « 1,40 € » ne font pas forcément le total de deux pièces.
      sum: formatCents(lineHtCents(line)),
    })),
  );

  /** La remise, telle qu'elle se lit : « Remise retrait au Labo −10 % ». */
  protected readonly discountLabel = computed(() => {
    const choice = this.order.choice();
    if (choice === null || choice.discount === 0) {
      return null;
    }
    return fill(this.t().cart.discount, { at: choice.at, pct: String(choice.discount) });
  });

  protected readonly feeLabel = computed(() => {
    const fee = this.totals().feeCents;
    return fee === 0 ? null : this.t().cart.fee;
  });

  protected readonly vatLines = computed(() => {
    const c = this.t().cart;
    return this.totals().vat.map((share) => ({
      label: fill(c.vat, { rate: formatRate(share.rate) }),
      amount: formatCents(share.amountCents),
    }));
  });

  protected readonly upsellLabel = computed(() => {
    const piece = this.upsell.suggestion();
    return piece === null ? null : fill(this.t().shop.upsell, { name: piece.name });
  });

  /** Les totaux arrivent en centimes ; le gabarit ne connaît que des libellés. */
  protected money(cents: number): string {
    return formatCents(cents);
  }

  protected addUpsell(): void {
    const piece = this.upsell.suggestion();
    if (piece !== null) {
      this.cart.add(piece.sku);
    }
  }
}

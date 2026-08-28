import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { formatEuro, formatRate } from '../../../client/cart-total';
import { ClientCart } from '../../../client/client-cart.service';
import { ClientOrder } from '../../../client/client-order.service';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { VAT_SALE } from '../../../client/mock-shop';

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
 * - une ligne de TVA n'existe que si son taux est au panier ;
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
  private readonly order = inject(ClientOrder);

  protected readonly totals = this.cart.totals;

  protected readonly lines = computed(() =>
    this.cart.lines().map((line) => ({
      id: line.product.id,
      quantity: line.quantity,
      name: line.product.name,
      unit: formatEuro(line.product.price),
      sum: formatEuro(line.product.price * line.quantity),
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
    const fee = this.totals().fee;
    return fee === 0 ? null : this.t().cart.fee;
  });

  protected readonly vatLines = computed(() => {
    const c = this.t().cart;
    return this.totals().vat.map((share) => ({
      label: fill(c.vat, { rate: formatRate(share.rate) }),
      scope: share.rate === VAT_SALE ? c.vatSale : c.vatSweet,
      amount: formatEuro(share.amount),
    }));
  });

  protected readonly upsellLabel = computed(() => {
    const piece = this.cart.upsell();
    return piece === null ? null : fill(this.t().shop.upsell, { name: piece.name });
  });

  protected money(value: number): string {
    return formatEuro(value);
  }

  protected addUpsell(): void {
    const piece = this.cart.upsell();
    if (piece !== null) {
      this.cart.add(piece.id);
    }
  }
}

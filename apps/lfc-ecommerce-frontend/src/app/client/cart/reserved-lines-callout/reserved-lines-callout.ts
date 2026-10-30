import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { ClientCart } from '../client-cart.service';

/**
 * **Les articles du panier gardé que ce compte ne peut pas commander** —
 * réservés à un autre compte (`documentation/catalogue/plan-articles-sur-mesure.md`,
 * L3). Le panier les a déjà exclus du décompte et de la commande ; l'encadré le
 * dit, article par article, et propose de les retirer.
 */
@Component({
  selector: 'app-reserved-lines-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './reserved-lines-callout.html',
  styleUrl: './reserved-lines-callout.scss',
})
export class ReservedLinesCallout {
  protected readonly t = inject(ClientCopyService).t;
  private readonly cart = inject(ClientCart);

  /** Une phrase par article verrouillé encore au panier. */
  protected readonly messages = computed(() =>
    this.cart.reservedLines().map((item) => ({
      sku: item.sku,
      text: fill(this.t().cart.reservedLine, { name: item.name }),
    })),
  );

  protected drop(): void {
    this.cart.dropReserved();
  }
}

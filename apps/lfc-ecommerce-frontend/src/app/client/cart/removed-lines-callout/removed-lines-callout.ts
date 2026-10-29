import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldCalloutComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { ClientCart } from '../client-cart.service';

/**
 * **Les lignes que le devis a retirées** — l'article ne se vend plus dans
 * l'unité du panier, et le client doit l'ajouter de nouveau
 * (`documentation/pricing/plan-changer-l-unite-de-vente.md`, § 8). Jamais
 * convertie : « 3 » pièces ne deviennent pas 3 g.
 */
@Component({
  selector: 'app-removed-lines-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './removed-lines-callout.html',
})
export class RemovedLinesCallout {
  private readonly t = inject(ClientCopyService).t;
  private readonly cart = inject(ClientCart);

  /** Une phrase par article retiré, dans l'unité qu'il a désormais. */
  protected readonly messages = computed(() => {
    const c = this.t().cart;
    return this.cart.removedLines().map((line) =>
      fill(line.saleUnit === 'weight' ? c.unitChangedToWeight : c.unitChangedToPiece, {
        name: line.name,
      }),
    );
  });
}

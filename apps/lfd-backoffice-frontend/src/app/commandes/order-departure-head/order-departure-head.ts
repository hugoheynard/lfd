import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminBackorderView, AdminOrderShortfall, OrderLineView } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import { FoldCalloutComponent } from 'fold-ng';

import { AbandonedRemainder } from '../abandoned-remainder/abandoned-remainder';
import { abandonedOfShortfall } from '../shortfall-remainder';

/**
 * **La décision du départ, en tête de la fiche** (`documentation/commandes/reliquat/reliquat.md`, § 7 ; Hugo, 2026-11-25 : « on doit pouvoir tracer absolument ce qui s'est
 * passé »). Qui a décidé, quand, ce qui est parti, le reste abandonné ligne à
 * ligne, et le lien vers son reliquat. Rien sans décision.
 */
@Component({
  selector: 'app-order-departure-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AbandonedRemainder, DatePipe, FoldCalloutComponent, RouterLink],
  templateUrl: './order-departure-head.html',
})
export class OrderDepartureHead {
  readonly shortfall = input.required<AdminOrderShortfall | null>();
  readonly lines = input.required<readonly Pick<OrderLineView, 'sku' | 'productName'>[]>();
  readonly backorder = input<AdminBackorderView | null>(null);

  protected readonly decision = computed(() => this.shortfall()?.decision ?? null);

  /**
   * « par Claire Martin » ; « par une fiche introuvable » quand l'annuaire ne
   * la connaît plus ; rien d'un serveur qui ne dit pas qui a décidé.
   */
  protected readonly by = computed(() => {
    const name = this.decision()?.decidedByName;
    if (name === undefined) {
      return null;
    }
    return name === null ? 'par une fiche introuvable' : `par ${name}`;
  });

  /** « 1 Croissant, 2 Baguette » — ce qui est parti, nommé par la commande. */
  protected readonly departed = computed(() => {
    const departing = this.decision()?.departing;
    if (departing === undefined) {
      return null;
    }
    const names = new Map(this.lines().map((line) => [line.sku, line.productName]));
    const gone = departing.filter((line) => line.quantity > 0);
    return gone.length === 0
      ? 'rien'
      : gone
          .map(
            (line) =>
              `${saleQuantityLabel(line.quantity, line.saleUnit)} ${names.get(line.sku) ?? line.sku}`,
          )
          .join(', ');
  });

  protected readonly abandoned = computed(() =>
    abandonedOfShortfall(
      this.shortfall(),
      new Map(this.lines().map((line) => [line.sku, line.productName])),
    ),
  );
}

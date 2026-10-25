import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AdminOrderShortfall, OrderLineView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

/** Une ligne au manque, nommée par la commande. */
interface ShortLine {
  readonly sku: string;
  readonly name: string;
  readonly due: number;
  readonly packed: number;
}

/**
 * **Le bandeau du manque signalé** (lot E6a,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 3) : le colisage
 * a signalé qu'il manque des pièces, et la commande attend une décision.
 * Lecture seule ; la décision se prend juste dessous
 * (`app-order-shortfall-decision`, E6b), qui la dit une fois prise. Rien quand
 * aucun manque n'attend.
 *
 * Les lignes complètes ne sont pas répétées : seules celles où il manque
 * quelque chose sont dites, avec ce qui est au bac.
 */
@Component({
  selector: 'app-order-shortfall-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FoldCalloutComponent],
  templateUrl: './order-shortfall-banner.html',
})
export class OrderShortfallBanner {
  readonly shortfall = input.required<AdminOrderShortfall | null>();
  /** Les lignes de la commande, pour nommer les articles. */
  readonly lines = input.required<readonly Pick<OrderLineView, 'sku' | 'productName'>[]>();

  protected readonly short = computed<readonly ShortLine[]>(() => {
    const shortfall = this.shortfall();
    if (shortfall === null) {
      return [];
    }
    const names = new Map(this.lines().map((line) => [line.sku, line.productName]));
    return shortfall.lines
      .filter((line) => line.packed < line.due)
      .map((line) => ({ ...line, name: names.get(line.sku) ?? line.sku }));
  });
}

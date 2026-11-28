import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FoldSurfaceDirective, FoldViewToggleComponent, type FoldViewToggleOption } from 'fold-ng';

import { NO_FILTERS, filtersToQuery } from '../order-list-filters';
import { AdminOrdersService } from '../orders.service';
import { scopeDays, type OrdersScope } from '../orders-scope';
import { watchGlobalSubjects } from '../../shared/version/watch-global-subjects';

const SCOPES: readonly FoldViewToggleOption[] = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'tomorrow', label: 'Demain' },
  { value: 'all', label: 'Toutes' },
];

function isScope(value: string): value is OrdersScope {
  return value === 'today' || value === 'tomorrow' || value === 'all';
}

/**
 * **Le bandeau de la liste des commandes** : le cadrage (aujourd'hui, demain,
 * toutes) avec ses deux comptes, les onglets, le geste « Nouvelle commande »,
 * puis la recherche et le filtre, projetés par la page.
 *
 * Un compte du cadrage est le `total` de `GET /admin/orders` sous les bornes
 * du jour, lu avec `limit=1` : le chiffre est exactement la longueur de la
 * liste qu'il ouvre.
 */
@Component({
  selector: 'app-orders-list-masthead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSurfaceDirective, FoldViewToggleComponent],
  templateUrl: './orders-list-masthead.html',
  styleUrl: './orders-list-masthead.scss',
})
export class OrdersListMasthead {
  /** Le cadrage lu dans l'adresse ; `null` pour une plage posée à la main. */
  readonly scope = input.required<OrdersScope | null>();
  /** Le jour de Paris de référence, `AAAA-MM-JJ`. */
  readonly today = input.required<string>();

  readonly scopeChange = output<OrdersScope>();

  private readonly orders = inject(AdminOrdersService);

  /** Les commandes à servir aujourd'hui et demain ; `null` tant qu'on ne le sait pas. */
  private readonly dayCounts = signal<Readonly<Record<'today' | 'tomorrow', number | null>>>({
    today: null,
    tomorrow: null,
  });
  /**
   * Le cadrage porte son compte : « Aujourd’hui · 12 ». Il remplace les cartes
   * « Pour aujourd'hui » et « Pour demain », qui disaient le même chiffre une
   * ligne plus bas (Hugo, 2026-11-28).
   */
  protected readonly scopes = computed<readonly FoldViewToggleOption[]>(() => {
    const counts = this.dayCounts();
    return SCOPES.map((scope) => {
      const count = scope.value === 'all' ? null : counts[scope.value as 'today' | 'tomorrow'];
      return count === null ? scope : { ...scope, label: `${scope.label} · ${count}` };
    });
  });

  constructor() {
    effect(() => {
      const today = this.today();
      untracked(() => void this.countDays(today));
    });
    watchGlobalSubjects(['orders-all'], () => this.countDays(this.today()));
  }

  protected choose(value: string): void {
    if (isScope(value)) this.scopeChange.emit(value);
  }

  /** Les deux comptes du cadrage, lus comme ceux des cartes : `total` sous `limit=1`. */
  private async countDays(today: string): Promise<void> {
    const read = (scope: OrdersScope): Promise<number | null> =>
      this.orders
        .list({ ...filtersToQuery({ ...NO_FILTERS, ...scopeDays(scope, today) }), limit: 1 })
        .then((page) => page.total)
        .catch(() => null);
    const [todayCount, tomorrowCount] = await Promise.all([read('today'), read('tomorrow')]);
    this.dayCounts.set({ today: todayCount, tomorrow: tomorrowCount });
  }
}

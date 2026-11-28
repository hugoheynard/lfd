import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import {
  FoldCardComponent,
  FoldPanelBodyComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NO_FILTERS, filtersToQuery, type OrderListFilters } from '../order-list-filters';
import { AdminOrdersService } from '../orders.service';
import { scopeStats, type OrdersScope, type ScopeStat } from '../orders-scope';

/** Le cadrage dont on montre les comptes, et le jour de Paris de référence. */
export interface OrdersStatsPanelData {
  readonly scope: OrdersScope;
  readonly today: string;
}

/** Un compte et son état : `null` tant qu'il n'est pas lu, ou si la lecture a échoué. */
interface CountedStat extends ScopeStat {
  readonly count: number | null;
}

const SCOPE_TITLES: Readonly<Record<OrdersScope, string>> = {
  today: 'Pour aujourd’hui',
  tomorrow: 'Pour demain',
  all: 'Toutes les commandes',
};

/**
 * **Les statistiques de la liste des commandes**, dans un panneau (Hugo,
 * 2026-11-28) : les comptes du cadrage choisi, hors de la liste qu'ils
 * prenaient en hauteur. Chaque compte est le `total` de `GET /admin/orders`
 * sous ses filtres, lu avec `limit=1` ; le toucher ferme le panneau et rend
 * ces filtres à la page, qui les pose.
 */
@Component({
  selector: 'app-orders-stats-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './orders-stats-panel.html',
  styleUrl: './orders-stats-panel.scss',
})
export class OrdersStatsPanel {
  readonly data = input.required<OrdersStatsPanelData>();

  private readonly ref = inject(FoldPanelRef<OrderListFilters>);
  private readonly orders = inject(AdminOrdersService);

  protected readonly stats = signal<readonly CountedStat[]>([]);

  constructor() {
    effect(() => {
      const { scope, today } = this.data();
      void this.count(scope, today);
    });
  }

  protected title(): string {
    return SCOPE_TITLES[this.data().scope];
  }

  protected pick(stat: ScopeStat): void {
    this.ref.close({ ...NO_FILTERS, ...stat.filters });
  }

  private async count(scope: OrdersScope, today: string): Promise<void> {
    const defs = scopeStats(scope, today);
    this.stats.set(defs.map((stat) => ({ ...stat, count: null })));
    const counts = await Promise.all(
      defs.map((stat) =>
        this.orders
          .list({ ...filtersToQuery({ ...NO_FILTERS, ...stat.filters }), limit: 1 })
          .then((page) => page.total)
          .catch(() => null),
      ),
    );
    this.stats.set(defs.map((stat, index) => ({ ...stat, count: counts[index] ?? null })));
  }
}

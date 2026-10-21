import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { LiveStockAlertsView, ResuppliesToProduceView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { parisClock, RESUPPLY_TARGET_LABELS, resupplyDayLabel } from '../../shared/resupply-labels';
import { LiveStockAlertsCard } from './live-stock-alerts-card/live-stock-alerts-card';
import { LiveStockAlertsService } from './live-stock-alerts.service';
import { ResuppliesToProduceService } from './resupplies-to-produce.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Réassorts à produire** — l'écran du fournil, EN LECTURE (lot R1,
 * `reassort-boutiques/plan-reapprovisionnement.md` §12, 2026-10-21) : par
 * journée (aujourd'hui, puis demain), le cumul par article, puis chaque
 * point et ses réassorts. Distinct des commandes client : le réassort
 * n'entre au plan figé qu'au lot R3 — d'ici là, cet écran est la seule
 * feuille où le fournil le voit.
 *
 * En tête depuis le lot R1b (2026-10-21) : les ruptures et stocks faibles
 * déclarés par les points, avec « Lancer un réassort au plus tôt ».
 */
@Component({
  selector: 'app-resupplies-to-produce-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    LiveStockAlertsCard,
  ],
  templateUrl: './resupplies-to-produce-page.html',
  styleUrl: './resupplies-to-produce-page.scss',
})
export class ResuppliesToProducePage {
  private readonly service = inject(ResuppliesToProduceService);
  private readonly stockAlerts = inject(LiveStockAlertsService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<ResuppliesToProduceView | null>(null);
  protected readonly alerts = signal<LiveStockAlertsView | null>(null);
  protected readonly targetLabels = RESUPPLY_TARGET_LABELS;
  protected readonly placedAt = parisClock;

  /** Les journées du serveur, nommées : la première est aujourd'hui. */
  protected readonly days = computed(() =>
    (this.view()?.days ?? []).map((day, index) => ({
      ...day,
      title: `${index === 0 ? "Aujourd'hui" : 'Demain'}, ${resupplyDayLabel(day.serviceDay)}`,
    })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [view, alerts] = await Promise.all([this.service.read(), this.stockAlerts.read()]);
      this.view.set(view);
      this.alerts.set(alerts);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}

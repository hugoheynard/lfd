import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ResuppliesToProduceView } from '@lfd/contracts';
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
import { ResuppliesToProduceService } from './resupplies-to-produce.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Réassorts à produire** — l'écran du fournil, EN LECTURE (lot R1,
 * `reassort-boutiques/plan-reapprovisionnement.md` §12, 2026-10-21) : par
 * journée (aujourd'hui, puis demain), le cumul par article, puis chaque
 * point et ses réassorts. Distinct des commandes client : le réassort
 * n'entre au plan figé qu'au lot R3 — d'ici là, cet écran est la seule
 * feuille où le fournil le voit.
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
  ],
  templateUrl: './resupplies-to-produce-page.html',
  styleUrl: './resupplies-to-produce-page.scss',
})
export class ResuppliesToProducePage {
  private readonly service = inject(ResuppliesToProduceService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<ResuppliesToProduceView | null>(null);
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
      this.view.set(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import type { ProductionDueThresholdsView, ProductionWorksheetView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { parisToday } from '../../../shared/paris-today';
import { WorkshopClock } from '../../fiche-atelier/workshop-clock';
import { ProductionService } from '../../production.service';
import { WorksheetService } from '../../worksheet.service';
import { tranchesNow } from '../day-tranches-section/day-tranches-section';
import { dayTrancheGrid, type TrancheGrid } from '../day-tranche-matrix';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **La journée en grille** pour le Prod manager (décision de Hugo,
 * 2026-11-01) : un produit par ligne, une tranche par colonne, ce qu'il faut
 * sortir DANS chaque tranche — et, le jour même ou passé, ce qui est sorti en
 * face, avec l'état de la vue par tranche.
 *
 * Le compte à rebours fait la grille ; la fiche n'apporte que le rayon,
 * l'unité et le sorti. Sans elle, la grille reste juste et le dit.
 */
@Component({
  selector: 'app-day-tranche-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  providers: [WorkshopClock],
  templateUrl: './day-tranche-grid.html',
  styleUrl: './day-tranche-grid.scss',
})
export class DayTrancheGrid {
  private readonly production = inject(ProductionService);
  private readonly worksheets = inject(WorksheetService);
  private readonly clock = inject(WorkshopClock);

  /** La journée de service, `AAAA-MM-JJ`. */
  readonly date = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  private readonly view = signal<ProductionDueThresholdsView | null>(null);
  private readonly worksheet = signal<ProductionWorksheetView | null>(null);
  /** La fiche n'a pas répondu : ni rayon, ni unité, ni sorti. */
  protected readonly worksheetLost = signal(false);

  /** `null` pour un jour à venir : seulement les quantités. */
  private readonly now = computed(() => {
    const today = parisToday();
    return this.date() > today ? null : tranchesNow(this.date(), today, this.clock.minutes());
  });

  protected readonly grid = computed<TrancheGrid | null>(() => {
    const view = this.view();
    return view === null ? null : dayTrancheGrid(view, this.worksheet(), this.now());
  });

  protected readonly showsProgress = computed(
    () => this.now() !== null && this.worksheet() !== null,
  );

  constructor() {
    effect(() => {
      void this.load(this.date());
    });
  }

  protected grams(grams: number): string {
    return saleQuantityLabel(grams, 'weight');
  }

  protected async load(date: string = this.date()): Promise<void> {
    this.state.set('loading');
    const [view, worksheet] = await Promise.allSettled([
      this.production.dueThresholds(date),
      this.worksheets.worksheet(date),
    ]);
    if (view.status === 'rejected') {
      this.state.set('error');
      return;
    }
    this.view.set(view.value);
    this.worksheet.set(worksheet.status === 'fulfilled' ? worksheet.value : null);
    this.worksheetLost.set(worksheet.status === 'rejected');
    this.state.set('ready');
  }
}

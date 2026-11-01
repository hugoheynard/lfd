import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { ProductionWorksheetView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { parisToday } from '../../../shared/paris-today';
import { WorkshopClock } from '../../fiche-atelier/workshop-clock';
import { WorksheetSlots } from '../../fiche-atelier/worksheet-slots/worksheet-slots';
import { WorksheetService } from '../../worksheet.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Une journée entière, en minutes : un jour passé a tout franchi. */
const DAY_MINUTES = 24 * 60;

/**
 * « Maintenant », en minutes depuis minuit, pour la journée regardée : l'heure
 * de la fiche si c'est aujourd'hui (jour de Paris), `0` pour un jour à venir
 * (tout reste « À venir »), la journée entière pour un jour passé.
 */
export function tranchesNow(date: string, today: string, minutesNow: number): number {
  if (date === today) {
    return minutesNow;
  }
  return date > today ? 0 : DAY_MINUTES;
}

/**
 * **La vue par tranche** d'une journée, dans le Prod manager — la même que la
 * fiche d'atelier, en lecture seule : ce qui reste à sortir avant chaque
 * heure limite, et ce qui l'est déjà.
 */
@Component({
  selector: 'app-day-tranches-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    WorksheetSlots,
  ],
  providers: [WorkshopClock],
  templateUrl: './day-tranches-section.html',
})
export class DayTranchesSection {
  private readonly worksheets = inject(WorksheetService);
  private readonly clock = inject(WorkshopClock);

  /** La journée de service, `AAAA-MM-JJ`. */
  readonly date = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  private readonly view = signal<ProductionWorksheetView | null>(null);

  /** Toutes les lignes, rayons confondus — comme les groupes de la fiche. */
  protected readonly lines = computed(
    () => this.view()?.groups.flatMap((group) => group.lines) ?? [],
  );

  protected readonly now = computed(() =>
    tranchesNow(this.date(), parisToday(), this.clock.minutes()),
  );

  constructor() {
    effect(() => {
      void this.load(this.date());
    });
  }

  protected async load(date: string = this.date()): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.worksheets.worksheet(date));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}

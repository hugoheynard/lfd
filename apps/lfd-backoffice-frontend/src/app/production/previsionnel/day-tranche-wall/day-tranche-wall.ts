import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  CatalogItemView,
  ProductionDueThresholdsView,
  ProductionForecastView,
  ProductionWorksheetView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { parisToday } from '../../../shared/paris-today';
import { WorkshopClock } from '../../fiche-atelier/workshop-clock';
import { ProductionService } from '../../production.service';
import { WorksheetService } from '../../worksheet.service';
import { dayTrancheGrid } from '../day-tranche-matrix';
import { tranchesNow } from '../day-tranches-section/day-tranches-section';
import { ForecastTable } from '../forecast-table/forecast-table';
import { trancheColumns, trancheFootRows, trancheRayons } from '../previsionnel-tranches';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **La journée par tranche** — la troisième vue du prévisionnel (Hugo,
 * 2026-11-01) : la table de la matrice, une ligne par produit, une colonne
 * par tranche. Ce qu'il faut sortir DANS chaque tranche ; le jour même ou
 * passé, ce qui est sorti en face, avec l'état de la vue par tranche.
 *
 * 🔴 Les lignes et leurs totaux sont ceux du PRÉVISIONNEL de la journée —
 * toutes les catégories, réassorts compris (Hugo, 2026-11-01) ; le compte à
 * rebours ne fait que les répartir par tranche, le reste va « Sans heure ».
 * La fiche d'atelier n'apporte que le sorti. Sans l'un ou l'autre, la grille
 * reste juste et le dit. Les rayons viennent du catalogue, comme la matrice.
 */
@Component({
  selector: 'app-day-tranche-wall',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ForecastTable,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  providers: [WorkshopClock],
  templateUrl: './day-tranche-wall.html',
  styleUrl: './day-tranche-wall.scss',
})
export class DayTrancheWall {
  private readonly production = inject(ProductionService);
  private readonly worksheets = inject(WorksheetService);
  private readonly clock = inject(WorkshopClock);

  /** La journée de service, `AAAA-MM-JJ`. */
  readonly date = input.required<string>();
  /** Le catalogue que la page a lu avec la matrice : les rayons. */
  readonly catalogue = input.required<readonly CatalogItemView[]>();
  /** `false` = le catalogue n'a pas répondu (la page le dit déjà). */
  readonly shelvesKnown = input(true);
  readonly showSubcategories = input(false);
  /** Le plan de la journée est-il arrêté ? `null` = la page ne l'a pas lu. */
  readonly planClosed = input<boolean | null>(null);

  protected readonly state = signal<LoadState>('loading');
  private readonly forecast = signal<ProductionForecastView | null>(null);
  private readonly due = signal<ProductionDueThresholdsView | null>(null);
  /** Le compte à rebours n'a pas répondu : rien n'est réparti. */
  protected readonly dueLost = signal(false);
  private readonly worksheet = signal<ProductionWorksheetView | null>(null);
  /** La fiche n'a pas répondu : ni unité, ni sorti. */
  protected readonly worksheetLost = signal(false);

  private readonly today = computed(() => parisToday());

  /** `null` pour un jour à venir : seulement les quantités. */
  private readonly now = computed(() =>
    this.date() > this.today()
      ? null
      : tranchesNow(this.date(), this.today(), this.clock.minutes()),
  );

  protected readonly grid = computed(() => {
    const forecast = this.forecast();
    return forecast === null
      ? null
      : dayTrancheGrid(forecast, this.date(), this.due(), this.worksheet(), this.now());
  });

  /** Les cases disent « sorti / à sortir » le jour même ou passé, fiche lue. */
  private readonly withProgress = computed(() => this.now() !== null && this.worksheet() !== null);

  protected readonly columns = computed(() => {
    const grid = this.grid();
    // Les en-têtes ne portent l'état que le jour même : sur un jour passé,
    // toutes les tranches seraient « Dépassée ».
    const withState = this.withProgress() && this.date() === this.today();
    return grid === null ? [] : trancheColumns(grid, withState, this.planClosed());
  });

  protected readonly footRows = computed(() => {
    const grid = this.grid();
    return grid === null ? [] : trancheFootRows(grid);
  });

  protected readonly rayons = computed(() => {
    const grid = this.grid();
    return grid === null
      ? []
      : trancheRayons(
          grid,
          this.catalogue(),
          this.shelvesKnown(),
          this.showSubcategories(),
          this.withProgress(),
        );
  });

  constructor() {
    effect(() => {
      void this.load(this.date());
    });
  }

  /** Le numéro de la dernière lecture : changer vite de journée n'affiche pas l'ancienne. */
  private readSeq = 0;

  protected async load(date: string = this.date()): Promise<void> {
    const seq = ++this.readSeq;
    this.state.set('loading');
    const [forecast, due, worksheet] = await Promise.allSettled([
      this.production.forecast(date, date),
      this.production.dueThresholds(date),
      this.worksheets.worksheet(date),
    ]);
    if (seq !== this.readSeq) {
      return;
    }
    if (forecast.status === 'rejected') {
      this.state.set('error');
      return;
    }
    this.forecast.set(forecast.value);
    this.due.set(due.status === 'fulfilled' ? due.value : null);
    this.dueLost.set(due.status === 'rejected');
    this.worksheet.set(worksheet.status === 'fulfilled' ? worksheet.value : null);
    this.worksheetLost.set(worksheet.status === 'rejected');
    this.state.set('ready');
  }
}

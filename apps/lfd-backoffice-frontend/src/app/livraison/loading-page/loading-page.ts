import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { DeliveryLoadingRoundSummaryView } from '@lfd/contracts';
import type { FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { parisTimeOf } from '../delivery-loading';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { roundLabel } from '../delivery-rounds';
import { DAY_QUERY_PARAM, dayOfQuery, isServiceDay, parisDayOf, shiftDay } from '../run-sheet';

type RoundsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rounds: readonly DeliveryLoadingRoundSummaryView[] };

const TODAY = '0';
const TOMORROW = '1';

/**
 * **Le chargement : choisir le véhicule** (`/livraison/chargement`, lot 4, L4-C2).
 *
 * Les tournées d'un jour, lues sous `delivery_loading:read` seul — aujourd'hui par défaut : on charge le matin du
 * départ. On en ouvre une, et c'est son écran qui scanne. Le jour vit dans
 * l'URL (`?jour=`), comme la feuille de route et la composition.
 */
@Component({
  selector: 'app-loading-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    RouterLink,
  ],
  templateUrl: './loading-page.html',
  styleUrl: './loading-page.scss',
})
export class LoadingPage {
  private readonly loading = inject(DeliveryLoadingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly today = parisDayOf(new Date());

  protected readonly dayOptions: readonly FoldViewToggleOption[] = [
    { value: TODAY, label: 'Aujourd’hui' },
    { value: TOMORROW, label: 'Demain' },
  ];

  /** Le jour de l'URL s'il est lisible, sinon aujourd'hui : on charge le jour du départ. */
  protected readonly day = signal(
    dayOfQuery(this.route.snapshot.queryParamMap.get(DAY_QUERY_PARAM)) ?? this.today,
  );
  protected readonly dayChoice = computed(() => {
    const day = this.day();
    if (day === this.today) {
      return TODAY;
    }
    return day === shiftDay(this.today, 1) ? TOMORROW : '';
  });

  protected readonly state = signal<RoundsState>({ status: 'loading' });
  private readonly reload = signal(0);

  protected readonly dayRounds = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.rounds : [];
  });

  protected readonly roundLabel = roundLabel;
  protected readonly timeOf = parisTimeOf;

  /** « 3 arrêts chargés sur 5 », ou l'heure de départ : ce qu'on lit avant d'ouvrir. */
  /** « 1 arrêt à refaire » — un bac partagé qui n'est plus entre deux arrêts consécutifs (v2-4). */
  protected toRedoOf(round: DeliveryLoadingRoundSummaryView): string {
    const count = round.stopsWithBinToRedo;
    return `${String(count)} arrêt${count > 1 ? 's' : ''} à refaire`;
  }

  protected summaryOf(round: DeliveryLoadingRoundSummaryView): string {
    if (round.departedAt !== null) {
      return `Partie à ${parisTimeOf(round.departedAt)}`;
    }
    if (round.stops === 0) {
      return 'aucun arrêt';
    }
    return `${String(round.loadedStops)} arrêt${round.loadedStops > 1 ? 's' : ''} chargé${round.loadedStops > 1 ? 's' : ''} sur ${String(round.stops)}`;
  }

  private request = 0;

  constructor() {
    effect(() => {
      const day = this.day();
      this.reload();
      untracked(() => void this.load(day));
    });
  }

  protected pickChoice(value: string): void {
    this.showDay(shiftDay(this.today, value === TODAY ? 0 : 1));
  }

  protected pickDate(value: string): void {
    if (isServiceDay(value)) {
      this.showDay(value);
    }
  }

  private showDay(day: string): void {
    this.day.set(day);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [DAY_QUERY_PARAM]: day },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  private async load(day: string): Promise<void> {
    const request = ++this.request;
    this.state.set({ status: 'loading' });
    try {
      const { rounds } = await this.loading.day(day);
      if (request === this.request) {
        this.state.set({ status: 'ready', rounds });
      }
    } catch {
      if (request === this.request) {
        this.state.set({ status: 'error' });
      }
    }
  }
}

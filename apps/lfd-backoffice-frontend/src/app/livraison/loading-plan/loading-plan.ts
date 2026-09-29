import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { DeliveryLoadingPlanView, DeliveryLoadingRoundView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldMeterComponent,
} from 'fold-ng';

import {
  currentStep,
  isStepLoaded,
  loadedBinKeys,
  planBinKey,
  planBinLabel,
  stackStopsLabel,
  stackTitle,
  stepHeadline,
  volumeGauges,
} from '../delivery-loading-plan';
import { DeliveryLoadingService } from '../delivery-loading.service';

type PlanState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly plan: DeliveryLoadingPlanView };

/**
 * **Le plan de chargement d'une tournée** (`plan-preparation-de-tournee.md`,
 * lot 4 bis, L4b-C7, v2-5) : l'ordre SUGGÉRÉ, les piles, le volume sec et
 * froid, et les alertes du serveur telles quelles.
 *
 * Le plan ne change pas quand on scanne : il se relit quand la tournée change
 * de version (un arrêt ajouté, retiré, déplacé). Ce qui est déjà chargé se
 * croise avec la vue du chargement, que la page relit après chaque geste.
 */
@Component({
  selector: 'app-loading-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldMeterComponent,
  ],
  templateUrl: './loading-plan.html',
  styleUrl: './loading-plan.scss',
})
export class LoadingPlan {
  private readonly service = inject(DeliveryLoadingService);

  /** La vue du chargement : son id, sa version, et ses bacs déjà chargés. */
  readonly round = input.required<DeliveryLoadingRoundView>();

  protected readonly state = signal<PlanState>({ status: 'loading' });
  private readonly reload = signal(0);

  private readonly roundKey = computed(
    () => `${this.round().roundId}@${String(this.round().version)}`,
  );

  protected readonly plan = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.plan : null;
  });

  protected readonly loaded = computed(() => loadedBinKeys(this.round()));

  protected readonly current = computed(() => {
    const plan = this.plan();
    return plan === null ? null : currentStep(plan.order, this.loaded());
  });

  protected readonly gauges = computed(() => {
    const plan = this.plan();
    return plan === null ? [] : volumeGauges(plan.volume);
  });

  protected readonly headline = stepHeadline;
  protected readonly binLabel = planBinLabel;
  protected readonly binKey = planBinKey;
  protected readonly stackTitle = stackTitle;
  protected readonly stackStops = stackStopsLabel;
  protected readonly stepLoaded = isStepLoaded;

  constructor() {
    effect(() => {
      this.roundKey();
      this.reload();
      const roundId = untracked(() => this.round().roundId);
      untracked(() => void this.read(roundId));
    });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  private async read(roundId: string): Promise<void> {
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      this.state.set({ status: 'ready', plan: await this.service.plan(roundId) });
    } catch {
      if (this.state().status !== 'ready') {
        this.state.set({ status: 'error' });
      }
    }
  }
}

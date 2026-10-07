import { computed, effect, inject, signal, untracked } from '@angular/core';
import type { DeliveryLoadingPlanView, DeliveryLoadingRoundView } from '@lfd/contracts';

import { LoadingGateway } from './loading-gateway';

type RoundState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryLoadingRoundView };

type PlanState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly plan: DeliveryLoadingPlanView };

/**
 * **La tournée à charger et son plan, lus et relus** — sortis du composant
 * `LoadingRound`, qui garde les gestes. À construire dans un contexte
 * d'injection (un initialiseur de champ du composant) : la classe injecte la
 * passerelle et pose ses deux effets.
 *
 * Une relecture qui échoue après un premier succès garde la dernière vue :
 * l'écran ne repasse pas en erreur au milieu d'un chargement.
 */
export class LoadingRoundSource {
  private readonly gateway = inject(LoadingGateway);

  readonly state = signal<RoundState>({ status: 'loading' });
  private readonly reload = signal(0);
  readonly planState = signal<PlanState>({ status: 'loading' });
  private readonly planReload = signal(0);

  readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });
  readonly plan = computed(() => {
    const state = this.planState();
    return state.status === 'ready' ? state.plan : null;
  });

  private readonly planKey = computed(() => {
    const view = this.view();
    return view === null ? null : `${view.roundId}@${String(view.version)}`;
  });

  constructor(
    roundId: () => string,
    private readonly onView: (view: DeliveryLoadingRoundView) => void,
  ) {
    effect(() => {
      const id = roundId();
      this.reload();
      untracked(() => void this.open(id));
    });
    // Le plan ne change pas quand on scanne : il se relit quand la tournée
    // change de version (un arrêt ajouté, retiré, déplacé).
    effect(() => {
      const key = this.planKey();
      this.planReload();
      const id = untracked(() => this.view()?.roundId ?? null);
      if (key !== null && id !== null) {
        untracked(() => void this.readPlan(id));
      }
    });
  }

  retry(): void {
    this.reload.update((n) => n + 1);
  }

  retryPlan(): void {
    this.planReload.update((n) => n + 1);
  }

  async read(roundId: string): Promise<void> {
    try {
      const view = await this.gateway.round(roundId);
      this.state.set({ status: 'ready', view });
      this.onView(view);
    } catch {
      if (this.state().status !== 'ready') {
        this.state.set({ status: 'error' });
      }
    }
  }

  private async open(roundId: string): Promise<void> {
    this.state.set({ status: 'loading' });
    await this.read(roundId);
  }

  private async readPlan(roundId: string): Promise<void> {
    if (this.planState().status !== 'ready') {
      this.planState.set({ status: 'loading' });
    }
    try {
      this.planState.set({ status: 'ready', plan: await this.gateway.plan(roundId) });
    } catch {
      if (this.planState().status !== 'ready') {
        this.planState.set({ status: 'error' });
      }
    }
  }
}

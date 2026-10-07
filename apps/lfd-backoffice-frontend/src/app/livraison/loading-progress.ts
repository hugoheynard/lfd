import { computed, type Signal } from '@angular/core';
import type { DeliveryLoadingPlanView, DeliveryLoadingRoundView } from '@lfd/contracts';

import { railTicks } from './rail-ticks';

/**
 * **L'avancement d'un chargement** — des comptes purs, sortis du composant
 * `LoadingRound` : la barre, le « reste à finir » et le mot de la fin se
 * dérivent tous des mêmes quatre nombres.
 */
export interface LoadingProgress {
  readonly loaded: number;
  readonly total: number;
  readonly stops: number;
  readonly stopsLeft: number;
}

/** « 4 / 15 bacs chargés · 5 arrêts à finir » — les nombres. */
export function loadingProgress(stops: DeliveryLoadingRoundView['stops']): LoadingProgress {
  const bins = stops.flatMap((stop) => stop.bins);
  return {
    loaded: bins.filter((bin) => bin.loadedAt !== null).length,
    total: bins.length,
    stops: stops.length,
    stopsLeft: stops.filter((stop) => stop.state !== 'loaded').length,
  };
}

/** « complet », « 1 arrêt à finir », « 5 arrêts à finir ». */
export function stopsLeftLabel(left: number): string {
  return left === 0 ? 'complet' : `${String(left)} arrêt${left > 1 ? 's' : ''} à finir`;
}

/** La part chargée, en pourcentage ; 0 quand il n'y a rien à charger. */
export function progressPercent({ loaded, total }: LoadingProgress): number {
  return total === 0 ? 0 : (loaded / total) * 100;
}

/** Vrai quand il y a des bacs et qu'ils sont tous chargés. */
export function allLoaded({ loaded, total }: LoadingProgress): boolean {
  return total > 0 && loaded === total;
}

/** « 15 bacs · 6 arrêts · caisse froide comprise » — le sous-titre de la fin. */
export function doneSubtitle(
  { total, stops }: LoadingProgress,
  plan: DeliveryLoadingPlanView | null,
): string {
  const cold = plan?.stacks.some((stack) => stack.placement?.kind === 'refrigerated');
  return `${String(total)} bacs · ${String(stops)} arrêts${cold === true ? ' · caisse froide comprise' : ''}`;
}

/**
 * Les signaux d'avancement de l'écran « Charger », dérivés de la tournée lue
 * et du plan — l'écran les relit tels quels.
 */
export function loadingProgressSignals(
  view: Signal<DeliveryLoadingRoundView | null>,
  plan: Signal<DeliveryLoadingPlanView | null>,
) {
  /** « 4 / 15 bacs chargés · 5 arrêts à finir ». */
  const progress = computed(() => loadingProgress(view()?.stops ?? []));
  return {
    progress,
    stopsLeftLabel: computed(() => stopsLeftLabel(progress().stopsLeft)),
    /**
     * La barre en traits, un par bac, par paquets de dix ; `null` au-delà de
     * `RAIL_TICKS_MAX`, où des traits trop fins redeviennent une barre.
     */
    railGroups: computed(() => {
      const { loaded, total } = progress();
      return railTicks(loaded, total);
    }),
    progressPercent: computed(() => progressPercent(progress())),
    allLoaded: computed(() => allLoaded(progress())),
    doneSubtitle: computed(() => doneSubtitle(progress(), plan())),
  };
}

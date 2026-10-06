import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { DeliveryCompositionGap, DeliveryDayArrestView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { DeliveryRoundsService } from '../delivery-rounds.service';

type ReadinessState =
  | { readonly status: 'idle' }
  | { readonly status: 'ready'; readonly arrest: DeliveryDayArrestView | null }
  | { readonly status: 'error' };

/** Ce qui manque au socle, et où le régler — les mots du refus de « Proposer ». */
const GAP_WORDS: Readonly<Record<DeliveryCompositionGap, string>> = {
  no_measured_vehicle:
    'aucun véhicule en service n’a ses cotes. Renseignez-les dans Livraison → Véhicules',
  no_active_bin_type: 'aucun type de bac n’est en service. Ajoutez-en un dans Livraison → Bacs',
};

function deliveries(count: number): string {
  return count > 1 ? `${count} livraisons` : `${count} livraison`;
}

/**
 * **Le plan arrêté, sur l'écran des tournées** (plan de composition
 * automatique, §16.5, S5, CA6a).
 *
 * Trois états : le plan n'est pas arrêté (rien) ; arrêté (« Plan arrêté — N
 * livraisons, dont P hors tournée », et « Proposer les tournées » mis en
 * avant tant qu'il en reste à placer) ; arrêté sans socle de composition
 * (CA-D3 : l'alerte dit quoi régler). « Appliquer » reste au bureau (§9).
 *
 * Il relit à chaque changement de `refresh` : la page lui passe sa
 * composition, pour que « hors tournée » suive les gestes du tableau.
 */
@Component({
  selector: 'app-day-readiness-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './day-readiness-banner.html',
})
export class DayReadinessBanner {
  private readonly rounds = inject(DeliveryRoundsService);

  readonly day = input.required<string>();
  /** Change de valeur : relire. */
  readonly refresh = input<unknown>(null);
  readonly canWrite = input(false);

  /** « Proposer les tournées » : la page ouvre son panneau. */
  readonly propose = output();

  protected readonly state = signal<ReadinessState>({ status: 'idle' });
  private request = 0;

  protected readonly arrest = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.arrest : null;
  });
  protected readonly countLabel = computed(() => deliveries(this.arrest()?.deliveryCount ?? 0));
  protected readonly gapWords = computed(() => {
    const gap = this.arrest()?.compositionGap ?? null;
    return gap === null ? null : GAP_WORDS[gap];
  });

  constructor() {
    effect(() => {
      const day = this.day();
      this.refresh();
      untracked(() => void this.load(day));
    });
  }

  private async load(day: string): Promise<void> {
    const request = ++this.request;
    try {
      const view = await this.rounds.readiness(day);
      if (request === this.request) {
        this.state.set({ status: 'ready', arrest: view.arrested });
      }
    } catch {
      if (request === this.request) {
        this.state.set({ status: 'error' });
      }
    }
  }
}

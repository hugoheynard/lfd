import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DeliveryCompositionGap } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { DeliveryRoundsService } from '../delivery-rounds.service';

/** Un manque, comme l'écran le dit, et l'écran de réglage qui le comble. */
interface GapLine {
  readonly gap: DeliveryCompositionGap;
  readonly words: string;
  readonly link: string;
  readonly linkLabel: string;
}

const GAP_LINES: Readonly<Record<DeliveryCompositionGap, Omit<GapLine, 'gap'>>> = {
  no_measured_vehicle: {
    words: 'aucun véhicule en service n’a ses cotes',
    link: '/reglages/livraison/vehicules',
    linkLabel: 'Réglages › Livraison › Véhicules',
  },
  no_active_bin_type: {
    words: 'aucun type de bac n’est en service',
    link: '/reglages/livraison/bacs',
    linkLabel: 'Réglages › Livraison › Bacs',
  },
};

type GapsState =
  | { readonly status: 'idle' }
  | { readonly status: 'ready'; readonly lines: readonly GapLine[] }
  | { readonly status: 'error' };

/**
 * **Le manque de flotte, rendu visible** (2026-10-22).
 *
 * La composition automatique échouait en silence — journaux seulement — sans
 * véhicule mesuré ni bac en service. Cet avertissement le dit en tête du Tour
 * manager et au bandeau de la Supervision, avec le lien vers le réglage qui
 * le comble. Rien ne manque : il ne rend rien.
 *
 * Lu une fois à l'ouverture : la flotte ne change pas au fil de la journée,
 * et la régler fait quitter l'écran.
 */
@Component({
  selector: 'app-composition-gaps-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, RouterLink],
  templateUrl: './composition-gaps-callout.html',
})
export class CompositionGapsCallout {
  private readonly rounds = inject(DeliveryRoundsService);

  protected readonly state = signal<GapsState>({ status: 'idle' });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const view = await this.rounds.compositionGaps();
      this.state.set({
        status: 'ready',
        lines: view.gaps.map((gap) => ({ gap, ...GAP_LINES[gap] })),
      });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PriceOverlapView, PriceRuleView } from '@lfd/contracts';

import { ruleSentence } from '../pricing-format';
import {
  barOf,
  composedLabel,
  periodLabel,
  timelineWindow,
  type TimelineBar,
} from './timeline-model';

/** Une règle, prête à être posée sur l'axe. */
interface TimelineRow {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly bar: TimelineBar;
  readonly overlapped: boolean;
}

/** Un recouvrement, posé sur le même axe, sous les règles qui le produisent. */
interface TimelineOverlap {
  readonly key: string;
  readonly bar: TimelineBar;
  readonly composed: string | null;
  readonly period: string;
  readonly kind: PriceOverlapView['kind'];
}

/**
 * **La frise des altérations du catalogue.**
 *
 * Une ligne par règle, sur un axe de dates commun : le recouvrement se VOIT,
 * au lieu de se déduire en comparant quatre dates de tête. Sous les barres, les
 * tranches où plusieurs règles jouent en même temps, avec ce qu'elles font
 * vraiment au prix.
 *
 * **Le cumul n'est pas une somme** — −20 % puis −10 % font −28 % — et il vient
 * du serveur, avec l'arithmétique qui facture. Le composant n'en calcule aucun :
 * il place des barres.
 *
 * Deux recouvrements à ne pas confondre, et l'écran les nomme : `compose`, où le
 * client paie le produit des deux ; `supersede`, où les règles partagent leur
 * étage et où la plus spécifique évince simplement l'autre.
 */
@Component({
  selector: 'app-overlap-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overlap-timeline.html',
  styleUrl: './overlap-timeline.scss',
})
export class OverlapTimeline {
  readonly rules = input.required<readonly PriceRuleView[]>();
  readonly overlaps = input.required<readonly PriceOverlapView[]>();

  private readonly window = computed(() => timelineWindow(this.rules()));

  /** La frise ne s'affiche que si elle a quelque chose à montrer. */
  protected readonly visible = computed(() => this.window() !== null && this.overlaps().length > 0);

  protected readonly rows = computed<readonly TimelineRow[]>(() => {
    const window = this.window();
    if (window === null) {
      return [];
    }
    const overlapped = new Set(this.overlaps().flatMap((overlap) => overlap.ruleIds));
    return this.rules().map((rule) => ({
      id: rule.id,
      label: rule.label,
      summary: ruleSentence(rule),
      bar: barOf(window, rule.validFrom, rule.validTo),
      overlapped: overlapped.has(rule.id),
    }));
  });

  protected readonly segments = computed<readonly TimelineOverlap[]>(() => {
    const window = this.window();
    if (window === null) {
      return [];
    }
    return this.overlaps().map((overlap) => ({
      key: `${overlap.from}-${overlap.ruleIds.join('-')}`,
      bar: barOf(window, overlap.from, overlap.to),
      composed: composedLabel(overlap),
      period: periodLabel(overlap),
      kind: overlap.kind,
    }));
  });
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PriceOverlapView } from '@lfd/contracts';

import {
  barOf,
  composedLabel,
  periodLabel,
  timelineWindow,
  type TimelineBar,
} from './timeline-model';

/**
 * **Une barre à poser sur l'axe** — une règle, ou un barème.
 *
 * La frise ne connaît ni l'un ni l'autre : elle place des périodes nommées. Les
 * deux familles ont des formes très différentes (l'une porte un effet, l'autre
 * une échelle de paliers) et rien de tout cela ne sert à tracer une barre.
 */
export interface TimelineBand {
  readonly id: string;
  readonly label: string;
  /** Ce que le survol dit — une phrase déjà écrite par l'appelant. */
  readonly summary: string;
  readonly validFrom: string;
  readonly validTo: string | null;
}

/** Une bande, une fois placée. */
interface TimelineRow {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly bar: TimelineBar;
  /** Les tranches où une plus spécifique l'évince : la barre s'y creuse. */
  readonly evictions: readonly TimelineBar[];
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
 * **La frise d'une lignée** — le catalogue et la famille sur un axe commun.
 *
 * C'est **entre niveaux** que le recouvrement arrive : deux règles de même étage
 * et même portée ne peuvent pas se recouvrir, la contrainte d'exclusion
 * l'interdit. Une promotion famille, elle, recouvre en permanence la promotion
 * catalogue — et **l'évince**. Le tableau montrait déjà la barrée ; il ne disait
 * ni à partir de quand, ni jusqu'à quand.
 *
 * D'où les deux lectures que la frise porte, et qu'il ne faut pas confondre :
 *
 * - **l'éviction**, dans un même étage — la barre de la perdante se **creuse**
 *   sur la tranche où l'autre gagne. Elles ne s'additionnent pas, l'une passe ;
 * - **le cumul**, entre étages — le client paie le produit des gagnantes, et
 *   −20 % puis −10 % font −28 %.
 *
 * Aucun de ces deux chiffres n'est calculé ici : ils viennent du serveur, avec
 * l'arithmétique qui facture. Le composant place des barres.
 */
@Component({
  selector: 'app-overlap-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overlap-timeline.html',
  styleUrl: './overlap-timeline.scss',
})
export class OverlapTimeline {
  readonly bands = input.required<readonly TimelineBand[]>();
  readonly overlaps = input.required<readonly PriceOverlapView[]>();

  private readonly window = computed(() => timelineWindow(this.bands()));

  /**
   * Visible **dès deux règles**, même sans recouvrement.
   *
   * Voir deux barres qui ne se touchent pas répond à la question posée ; une
   * frise absente la laisse entière — on ne sait pas si rien ne se croise, ou si
   * l'écran ne le dit pas.
   */
  protected readonly visible = computed(() => this.window() !== null && this.bands().length > 1);

  protected readonly rows = computed<readonly TimelineRow[]>(() => {
    const window = this.window();
    if (window === null) {
      return [];
    }
    const overlapped = new Set(this.overlaps().flatMap((overlap) => overlap.ruleIds));
    return this.bands().map((band) => ({
      id: band.id,
      label: band.label,
      summary: band.summary,
      bar: barOf(window, band.validFrom, band.validTo),
      evictions: this.overlaps()
        .filter((overlap) => overlap.evictedRuleIds.includes(band.id))
        .map((overlap) => barOf(window, overlap.from, overlap.to)),
      overlapped: overlapped.has(band.id),
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

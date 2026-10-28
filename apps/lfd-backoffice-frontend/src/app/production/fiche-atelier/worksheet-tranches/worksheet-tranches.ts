import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldBadgeComponent } from 'fold-ng';

import type { DueThresholdView } from '@lfd/contracts';

const COUNT = new Intl.NumberFormat('fr-FR');

/** Une tranche telle que la ligne la montre. */
export interface ShownTranche {
  readonly label: string;
  readonly covered: boolean;
  /** La première tranche non couverte : celle qu'on met en avant. */
  readonly next: boolean;
}

/** Ce que la ligne lit d'un coup : les tranches, et ce qui manque à la prochaine. */
export interface TrancheReading {
  readonly tranches: readonly ShownTranche[];
  /** « Manque 550 avant 07:00 », ou `null` si tout est couvert. */
  readonly missing: string | null;
}

function count(value: number): string {
  return COUNT.format(value);
}

/** « 400 avant 05:00 », « 400 dans la journée », « 2 000 au total ». */
function trancheLabel(threshold: DueThresholdView): string {
  switch (threshold.kind) {
    case 'deadline':
    case 'before_first':
      return `${count(threshold.cumulative)} avant ${threshold.before ?? '?'}`;
    case 'day':
      return `${count(threshold.cumulative)} dans la journée`;
    case 'undated':
      return `${count(threshold.cumulative)} au total`;
  }
}

/** « avant 07:00 », « dans la journée », « au total » — l'échéance d'un manque. */
function deadlineOf(threshold: DueThresholdView): string {
  switch (threshold.kind) {
    case 'deadline':
    case 'before_first':
      return `avant ${threshold.before ?? '?'}`;
    case 'day':
      return 'dans la journée';
    case 'undated':
      return 'au total';
  }
}

/**
 * Les tranches CUMULÉES d'un produit face au sorti (plan
 * `production/plan-tranches-de-production.md`, §5) : une tranche est couverte
 * quand le sorti atteint son cumul ; la première qui ne l'est pas est mise en
 * avant, avec ce qui lui manque. Les seuils sont lus tels que servis.
 */
export function readTranches(
  thresholds: readonly DueThresholdView[],
  produced: number,
): TrancheReading {
  const nextIndex = thresholds.findIndex((threshold) => threshold.cumulative > produced);
  const next = nextIndex === -1 ? undefined : thresholds[nextIndex];
  return {
    tranches: thresholds.map((threshold, index) => ({
      label: trancheLabel(threshold),
      covered: threshold.cumulative <= produced,
      next: index === nextIndex,
    })),
    missing:
      next === undefined ? null : `Manque ${count(next.cumulative - produced)} ${deadlineOf(next)}`,
  };
}

/**
 * **Les tranches d'une ligne de fiche d'atelier** — « 400 avant 05:00 ·
 * 1 200 avant 07:00 · 2 000 avant 12:00 — sorti 650 ». Rien ne se coche par
 * tranche : une fournée ne se déclare pas « pour une tranche » (plan des
 * vagues, §7.2), elle avance le sorti, et la lecture suit.
 */
@Component({
  selector: 'app-worksheet-tranches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './worksheet-tranches.html',
  styleUrl: './worksheet-tranches.scss',
})
export class WorksheetTranches {
  readonly thresholds = input.required<readonly DueThresholdView[]>();
  readonly produced = input.required<number>();

  protected readonly reading = computed(() => readTranches(this.thresholds(), this.produced()));
  protected readonly producedLabel = computed(() => count(this.produced()));
}

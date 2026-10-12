import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BILLING_RHYTHM_KIND_LABELS, type LegalEntityView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldPageSectionComponent } from 'fold-ng';

import { closureLine, rhythmSentence } from '../../../billing-rhythm-wording';
import { longDay } from '../../../collection-month-wording';

/** Une ligne de la carte : un mode, tel que la comptabilité le lit. */
interface ModeLine {
  readonly mode: string;
  readonly label: string;
  readonly current: string;
  readonly scheduled: string | null;
  readonly locked: string | null;
  readonly closures: readonly string[];
  readonly payers: string;
}

/**
 * **Les dates des trois modes de facturation** de l'entité (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §16) — EN LECTURE SEULE.
 *
 * Lot M1 : le modèle a changé (l'entité fixe les dates de chaque mode, chaque
 * payeur en choisit un), l'écran qui les règle est le lot M4. Cette carte dit
 * ce qui est en base, sans geste — elle ne propose rien qu'elle ne sache pas
 * faire. Les dates, le programmé, le verrou et les clôtures viennent du
 * serveur ; rien n'est calculé ici.
 */
@Component({
  selector: 'app-billing-modes-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, FoldCalloutComponent],
  templateUrl: './billing-modes-card.html',
  styleUrl: './billing-modes-card.scss',
})
export class BillingModesCard {
  readonly entity = input.required<LegalEntityView>();

  protected readonly modes = computed((): readonly ModeLine[] =>
    this.entity().billingModes.map((mode) => ({
      mode: mode.mode,
      label: BILLING_RHYTHM_KIND_LABELS[mode.mode],
      current: rhythmSentence({ kind: mode.mode, days: mode.current.days }),
      scheduled:
        mode.scheduled === null
          ? null
          : `${rhythmSentence({ kind: mode.mode, days: mode.scheduled.days })}, à partir de la clôture du ${longDay(mode.scheduled.effectiveAt)}`,
      locked:
        mode.changeLockedUntil === null
          ? null
          : `Un seul changement à la fois : un autre sera possible à partir du ${longDay(mode.changeLockedUntil)}.`,
      closures: mode.upcomingClosures.map(closureLine),
      payers: payersSentence(mode.mode, mode.payerCount),
    })),
  );
}

/** Le mensuel compte aussi ceux qui n'ont rien choisi : il le dit plutôt que de taire. */
function payersSentence(mode: string, count: number): string {
  const chosen =
    count === 0
      ? 'Aucun client ne l’a choisi'
      : `${String(count)} client${count > 1 ? 's l’ont' : ' l’a'} choisi`;
  return mode === 'monthly'
    ? `${chosen} ; c’est aussi le mode de tout client qui n’a rien choisi.`
    : `${chosen}.`;
}

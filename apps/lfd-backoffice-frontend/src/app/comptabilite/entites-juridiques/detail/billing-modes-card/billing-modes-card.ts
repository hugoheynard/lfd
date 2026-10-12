import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { LegalEntityView } from '@lfd/contracts';
import { FoldPageSectionComponent } from 'fold-ng';

import { CLOSURE_TIME_SENTENCE } from '../../../billing-rhythm-wording';
import { BillingModeRow, type BillingModeSaved } from '../billing-mode-row/billing-mode-row';

/**
 * **Les dates des trois modes de facturation** de l'entité (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §16.9, M4b) : mensuel, deux fois par mois, chaque semaine — une ligne par
 * mode, chacune avec son réglage. Le mode de chaque client se choisit sur sa
 * fiche, pas ici.
 */
@Component({
  selector: 'app-billing-modes-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, BillingModeRow],
  templateUrl: './billing-modes-card.html',
  styleUrl: './billing-modes-card.scss',
})
export class BillingModesCard {
  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);

  readonly saved = output<BillingModeSaved>();

  protected readonly closureTime = CLOSURE_TIME_SENTENCE;
}

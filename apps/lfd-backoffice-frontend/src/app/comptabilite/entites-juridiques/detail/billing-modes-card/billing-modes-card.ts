import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { LegalEntityView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldPageSectionComponent } from 'fold-ng';

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
  imports: [FoldCalloutComponent, FoldPageSectionComponent, BillingModeRow],
  templateUrl: './billing-modes-card.html',
  styleUrl: './billing-modes-card.scss',
})
export class BillingModesCard {
  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);

  readonly saved = output<BillingModeSaved>();

  protected readonly closureTime = CLOSURE_TIME_SENTENCE;

  /**
   * « 3 clients sans mode choisi » — `null` quand tous ont choisi. Un choix
   * perdu entre la création d'un compte et son mode se voit ici, sans ouvrir
   * chaque fiche.
   */
  protected readonly withoutMode = computed(() => {
    const count = this.entity().payersWithoutModeCount;
    if (count === 0) {
      return null;
    }
    return count === 1 ? '1 client sans mode choisi' : `${count} clients sans mode choisi`;
  });
}

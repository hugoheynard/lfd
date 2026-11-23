import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { SHOP_TIME_ZONE } from '../../shop-time-zone';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { ClientBudgetCommitment } from '../budget-commitment.service';

/**
 * **Le bon de commande d'un organisme public**, au panier (plan clients
 * publics, § 6 quater) : le numéro d'engagement — exigé ou non, dit sous le
 * champ — et le code service, prérempli du défaut de la fiche Chorus. Le
 * panier ne le montre qu'à un payeur public ; la saisie vit dans
 * {@link ClientBudgetCommitment}, qui la fait partir avec la passation.
 */
@Component({
  selector: 'app-budget-commitment-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldInputComponent],
  templateUrl: './budget-commitment-fields.html',
  styleUrl: './budget-commitment-fields.scss',
})
export class BudgetCommitmentFields {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly commitment = inject(ClientBudgetCommitment);
  private readonly locale = inject(ClientLocale);

  protected readonly numberRequired = computed(
    () => this.commitment.requirements()?.commitmentRequired ?? false,
  );
  protected readonly serviceCodeRequired = computed(
    () => this.commitment.requirements()?.serviceCodeRequired ?? false,
  );
  protected readonly numberHint = computed(() =>
    this.numberRequired()
      ? this.t().cart.commitmentNumberRequiredHint
      : this.t().cart.commitmentNumberOptionalHint,
  );

  /**
   * L'engagement en cours, jugé contre la journée choisie : « en cours jusqu'au
   * … » quand il est proposé, « a pris fin le … » au-delà ; vide sans engagement.
   */
  protected readonly standingLine = computed(() => {
    const standing = this.commitment.standing();
    if (standing === null) {
      return '';
    }
    const cart = this.t().cart;
    const date = new Intl.DateTimeFormat(this.locale.current(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: SHOP_TIME_ZONE,
    }).format(new Date(`${standing.endsOn}T12:00:00Z`));
    return fill(standing.state === 'running' ? cart.commitmentRunning : cart.commitmentEnded, {
      number: standing.number,
      date,
    });
  });

  constructor() {
    this.commitment.ensure();
  }
}

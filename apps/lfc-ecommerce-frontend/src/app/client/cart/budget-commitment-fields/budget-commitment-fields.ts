import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
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

  constructor() {
    this.commitment.ensure();
  }
}

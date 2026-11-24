import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { BudgetCommitmentRequirementsView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

import {
  COMMITMENT_ON_QUOTE_LINE,
  commitmentOnQuote,
  commitmentStandingLine,
  type CommitmentStanding,
} from '../budget-commitment';

/**
 * **L'engagement budgétaire d'un organisme public**, saisi par l'équipe (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quater) : le numéro d'engagement de son bon de commande et le code
 * service Chorus. Partagé par la nouvelle commande et la correction sur la
 * fiche : les deux disent le même champ de la même façon.
 *
 * Les exigences viennent du serveur ; elles disent seulement si le champ est
 * marqué exigé. C'est la passation (ou la correction) qui refuse.
 */
@Component({
  selector: 'app-budget-commitment-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldInputComponent],
  templateUrl: './budget-commitment-fields.html',
  styleUrl: './budget-commitment-fields.scss',
})
export class BudgetCommitmentFields {
  /** `null` tant qu'elles ne sont pas lues, ou si leur lecture a échoué. */
  readonly requirements = input<BudgetCommitmentRequirementsView | null>(null);
  /** La lecture des exigences a échoué : la saisie reste possible, l'écran le dit. */
  readonly requirementsFailed = input(false);
  /**
   * L'engagement en cours jugé contre la journée choisie — à la nouvelle
   * commande seulement ; `null` : rien à en dire.
   */
  readonly standing = input<CommitmentStanding | null>(null);
  readonly number = model('');
  readonly serviceCode = model('');

  protected readonly standingLine = computed(() => {
    const standing = this.standing();
    return standing === null ? '' : commitmentStandingLine(standing);
  });

  /** Sur devis de période : pas de champ numéro, la phrase du devis à sa place. */
  protected readonly onQuote = computed(() => commitmentOnQuote(this.requirements()));
  protected readonly onQuoteLine = COMMITMENT_ON_QUOTE_LINE;

  protected readonly numberRequired = computed(
    () => this.requirements()?.commitmentRequired ?? false,
  );
  protected readonly serviceCodeRequired = computed(
    () => this.requirements()?.serviceCodeRequired ?? false,
  );

  protected readonly numberHint = computed(() =>
    this.numberRequired()
      ? 'Exigé par ce payeur. Il figure sur son bon de commande.'
      : 'Il figure sur le bon de commande du payeur, s’il en a un.',
  );

  protected readonly serviceCodeHint = computed(() => {
    const fallback = this.requirements()?.defaultServiceCode ?? '';
    return fallback === ''
      ? 'Le code Chorus Pro du service à qui la facture est adressée.'
      : `Le code Chorus Pro du service à qui la facture est adressée ; vide, c’est ${fallback}.`;
  });
}

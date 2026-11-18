import type { ChorusInvoiceFacts } from "../entities/chorus-deposit.js";
import type { ChorusDepositStanding } from "../services/public-invoice-due.js";

/** Une facture d'organisme public, telle que la page « Chorus Pro » la liste. */
export interface ChorusListedInvoice extends ChorusInvoiceFacts {
  readonly legalEntityId: string;
  readonly legalEntityName: string;
  readonly totalTtcCents: number;
  readonly budgetCommitmentNumber: string | null;
  readonly budgetCommitmentServiceCode: string | null;
  readonly documentAvailable: boolean;
  readonly standing: ChorusDepositStanding;
}

/** Restreindre à une entité émettrice, ou rien. */
export interface ChorusInvoicesFilter {
  readonly legalEntityId: string | null;
}

/**
 * Port de LECTURE de la page « Chorus Pro » (plan
 * `plan-clients-publics-chorus.md`, T4′). Deux lectures, une requête chacune.
 */
export abstract class ChorusInvoicesReader {
  /**
   * « À déposer » : les factures (380) d'un payeur public, sans ligne de
   * dépôt, non annulées par un avoir — les plus anciennes d'abord.
   */
  abstract toDeposit(filter: ChorusInvoicesFilter): Promise<readonly ChorusListedInvoice[]>;
  /** « Déposées » : celles qui ont une ligne de dépôt — les plus récemment déposées d'abord. */
  abstract deposited(filter: ChorusInvoicesFilter): Promise<readonly ChorusListedInvoice[]>;
}

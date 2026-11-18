import type { ChorusDepositStanding } from "../services/public-invoice-due.js";

/** Une facture au virement qu'aucun virement reçu n'a encore réglée. */
export interface UnpaidTransferInvoice {
  readonly invoiceId: string;
  readonly number: string;
  readonly legalEntityId: string;
  readonly legalEntityName: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** `AAAA-MM-JJ`. */
  readonly issuedOn: string;
  /**
   * `AAAA-MM-JJ` — l'échéance imprimée ; une facture au virement en a toujours
   * une. Celle d'un organisme public n'est que la plus tôt possible : le
   * retard se juge sur `effectiveDueOn` (T3′).
   */
  readonly dueOn: string;
  readonly remainingCents: number;
  /** La forme juridique de l'acheteur figée : dit si la facture est publique. */
  readonly buyerLegalForm: string;
  /** Son journal de dépôt sur Chorus ; vide (`NOT_DEPOSITED`) hors public. */
  readonly chorus: ChorusDepositStanding;
}

/** Restreindre la liste : à une entité, à un payeur, ou rien. */
export interface UnpaidTransferFilter {
  readonly legalEntityId: string | null;
  readonly payerCompanyId: string | null;
}

/**
 * Port de LECTURE des factures au virement non réglées (V8, C7) : ce que le
 * suivi des impayés et la fiche client lisent. Le retard se juge dans le
 * domaine, à l'horloge ; la lecture ne rend que des faits.
 */
export abstract class UnpaidTransferInvoicesReader {
  abstract unpaid(filter: UnpaidTransferFilter): Promise<readonly UnpaidTransferInvoice[]>;
}

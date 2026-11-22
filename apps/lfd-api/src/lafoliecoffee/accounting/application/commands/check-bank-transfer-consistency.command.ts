/**
 * **Le contrôle de cohérence du virement reçu** (plan
 * `documentation/payment/le-bloc-payment.md`) : la trace de la facturation
 * comparée à ce que le bloc `payment` a enregistré. Sans paramètre : la
 * fenêtre se lit à l'horloge.
 */
export class CheckBankTransferConsistencyCommand {}

/** Ce que le passage a lu et trouvé. */
export interface BankTransferConsistencyReport {
  /** Le début de la fenêtre relue, ISO. */
  readonly since: string;
  readonly checkedOrders: number;
  readonly checkedTransfers: number;
  readonly gaps: number;
}

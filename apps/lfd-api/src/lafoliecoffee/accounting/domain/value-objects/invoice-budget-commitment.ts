/**
 * **L'engagement budgétaire d'une facture** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quater) : le numéro du bon de commande d'un organisme public (BT-13) et
 * son code service Chorus (BT-10), tels que la commande les porte.
 *
 * Une chaîne vide dit « absent ». Les deux vides : pas d'engagement — la
 * valeur se normalise alors en `null`, pour qu'un payeur privé n'ait qu'une
 * seule clé, la même qu'avant P2.
 *
 * La forme d'un numéro valable se juge à la passation (`orders`) ; la facture
 * reprend ce que la commande porte, sans le rejuger.
 */
export interface InvoiceBudgetCommitment {
  readonly number: string;
  readonly serviceCode: string;
}

/** Deux colonnes nullables → l'engagement, ou `null` quand les deux sont vides. */
export function budgetCommitmentOf(
  number: string | null,
  serviceCode: string | null,
): InvoiceBudgetCommitment | null {
  const n = number ?? "";
  const code = serviceCode ?? "";
  return n === "" && code === "" ? null : { number: n, serviceCode: code };
}

/** Même numéro et même code (deux absences sont égales). */
export function sameBudgetCommitment(
  left: InvoiceBudgetCommitment | null,
  right: InvoiceBudgetCommitment | null,
): boolean {
  return (
    (left?.number ?? "") === (right?.number ?? "") &&
    (left?.serviceCode ?? "") === (right?.serviceCode ?? "")
  );
}

/** Les deux colonnes de clé de `invoice_monthly_outcome` : jamais NULL, `""` = absent. */
export function budgetCommitmentColumnsOf(commitment: InvoiceBudgetCommitment | null): {
  readonly budgetCommitmentNumber: string;
  readonly budgetCommitmentServiceCode: string;
} {
  return {
    budgetCommitmentNumber: commitment?.number ?? "",
    budgetCommitmentServiceCode: commitment?.serviceCode ?? "",
  };
}

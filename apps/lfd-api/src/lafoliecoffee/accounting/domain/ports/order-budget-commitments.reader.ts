import type { InvoiceBudgetCommitment } from "../value-objects/invoice-budget-commitment.js";

/**
 * L'engagement budgétaire que ces commandes portent **maintenant** (E4″) —
 * relu par l'émission sous le verrou des lignes `orders`, après les
 * annulations : un engagement corrigé depuis la préparation sort le bon de la
 * facture. Une commande inconnue est absente de la carte.
 */
export abstract class OrderBudgetCommitmentsReader {
  abstract commitmentsOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, InvoiceBudgetCommitment | null>>;
}

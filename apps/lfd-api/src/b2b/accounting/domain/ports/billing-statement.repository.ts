import type { BillingStatement } from "../entities/billing-statement.js";

/** Un arrêté que l'annulation de son lot vient de passer `cancelled`. */
export interface CancelledStatement {
  readonly statementId: string;
  readonly lineRank: number;
}

/**
 * Port d'ÉCRITURE des **arrêtés de facturation** (plan
 * `le-prelevement-suit-la-facture.md`).
 *
 * 🔴 **Immuable par construction** : deux gestes, et rien d'autre. Pas de
 * `save`, pas de `load` — un arrêté ne se recharge pas pour être muté, et
 * aucune écriture ciblée ne peut retoucher un montant, une identité ou un bon.
 * La base le tient aussi (déclencheur `billing_statement_immutable`) : seul
 * `active → cancelled` passe, jamais de `DELETE`.
 */
export abstract class BillingStatementRepository {
  /** Écrit un arrêté neuf et ses bons, dans la transaction de la constitution. */
  abstract insert(statement: BillingStatement): Promise<void>;

  /**
   * Passe `cancelled` les arrêtés actifs du lot, et les rend.
   *
   * À appeler APRÈS `CollectionBatch.cancel` (qui refuse un lot non
   * `constituted`) et AVANT `CollectionBatchRepository.save` : la base refuse
   * l'annulation d'un arrêté dont le lot n'est plus `constituted` en base.
   * Un lot d'avant F3 n'a pas d'arrêté : la liste rendue est vide.
   */
  abstract cancelForBatch(batchId: string): Promise<readonly CancelledStatement[]>;
}

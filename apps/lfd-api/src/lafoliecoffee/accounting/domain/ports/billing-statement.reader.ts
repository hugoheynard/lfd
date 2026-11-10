import type { BillingStatementView } from "@lfd/contracts";

/**
 * Port de LECTURE des **arrêtés de facturation** (plan
 * `le-prelevement-suit-la-facture.md`) — à part du port d'écriture,
 * qui n'a que `insert` et `cancel`.
 *
 * Il relit ce qui a été figé, sans rien recalculer : la facture rendue est le
 * `body` de la constitution, et c'est son total qui a été prélevé.
 */
export abstract class BillingStatementReader {
  /** L'arrêté, ou `null` s'il n'existe pas. */
  abstract byId(statementId: string): Promise<BillingStatementView | null>;
}

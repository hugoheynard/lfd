/** Le numéro reçu sur un devis, pour ses commandes encore à facturer. */
export interface QuotedCommitmentReceipt {
  readonly quoteId: string;
  readonly quoteNumber: string;
  /** Les commandes du devis, annulées retirées. */
  readonly orderIds: readonly string[];
  /** Le numéro renvoyé par l'organisme, tel que saisi. */
  readonly number: string;
  readonly staffUserId: string;
}

/**
 * Port d'**écriture** du numéro reçu sur un devis de période (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD6, v4 B1). Déclaré par la
 * comptabilité, implémenté par la commande, qui possède `orders` et la règle
 * (`OrderBudgetCommitment.acceptQuoted`) ; relié par
 * `appBootstrap/period-quote-commitment.module.ts`.
 *
 * Appelé dans la transaction de « Engagement reçu », sous le verrou des
 * lignes `orders` que le geste a pris : chaque commande doit être dans ce
 * devis en attente et sans numéro, sinon tout est refusé. Un fait durable
 * `order.budget_commitment_received` par commande, dans la même transaction.
 */
export abstract class QuotedOrdersCommitment {
  /** @throws le refus de la commande (pas dans ce devis, déjà numérotée, numéro mal formé). */
  abstract acceptQuoted(receipt: QuotedCommitmentReceipt): Promise<void>;
}

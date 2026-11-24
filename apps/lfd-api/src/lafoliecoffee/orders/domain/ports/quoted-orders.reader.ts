/** Le devis de période en attente qui porte une commande. */
export interface QuotedOrder {
  readonly quoteId: string;
  /** `D-<AAAAMMJJ>-<rang>`, pour nommer le devis dans un refus. */
  readonly quoteNumber: string;
}

/**
 * Port de **lecture** : la commande est-elle rangée dans un devis de période
 * en attente ? (plan `plan-clients-publics-chorus.md`, § 6 sexies, QD2 et
 * QD6). Déclaré par la commande, implémenté par la comptabilité, qui possède
 * `period_quote_order` ; relié par
 * `appBootstrap/period-quote-commitment.module.ts`.
 *
 * Le numéro d'une commande en devis passe par le devis : la correction
 * d'engagement la refuse, « Engagement reçu » n'accepte qu'elle.
 */
export abstract class QuotedOrdersReader {
  /** Le devis `awaiting` de la commande, ou `null`. Lu sous le verrou de l'appelant. */
  abstract awaitingQuoteOf(orderId: string): Promise<QuotedOrder | null>;
}

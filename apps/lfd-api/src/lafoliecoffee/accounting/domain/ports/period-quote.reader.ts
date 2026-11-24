import type { PeriodQuoteSnapshot } from "../entities/period-quote.js";

/**
 * Port de **lecture** d'un devis de période, pour son document et son envoi
 * (QD4). Séparé de {@link PeriodQuoteRepository} : l'abonné qui rend et
 * envoie n'a rien à écrire sur le devis.
 */
export abstract class PeriodQuoteReader {
  /** Le devis et ses commandes, ou `null`. */
  abstract byId(quoteId: string): Promise<PeriodQuoteSnapshot | null>;
}

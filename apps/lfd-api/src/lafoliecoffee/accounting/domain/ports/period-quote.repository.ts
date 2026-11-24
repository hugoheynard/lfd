import type { PeriodQuote } from "../entities/period-quote.js";

/**
 * Port d'ÉCRITURE des devis de période (`period_quote`, `period_quote_order`,
 * `period_quote_counter`). Appelé dans la transaction de la clôture d'un
 * payeur : le rang, le devis et ses commandes ensemble, ou rien.
 */
export abstract class PeriodQuoteRepository {
  /**
   * Le rang suivant de l'entité pour cette période (`AAAAMMJJ`), compteur
   * avancé et verrouillé jusqu'à la fin de la transaction. Un rang pris par un
   * passage qui ne range rien (devis déjà là) est perdu : un devis n'est pas
   * une pièce comptable, sa suite n'a pas à être continue.
   */
  abstract nextRank(legalEntityId: string, periodTag: string): Promise<number>;

  /**
   * Range le devis et ses commandes, chacun en `ON CONFLICT DO NOTHING`.
   *
   * @returns `null` quand un devis vivant existe déjà pour ce groupe et cette
   *   clôture (rien n'est écrit) ; sinon les commandes RÉELLEMENT rangées —
   *   une commande déjà dans un autre devis en attente n'y entre pas.
   */
  abstract insertAwaiting(quote: PeriodQuote): Promise<ReadonlySet<string> | null>;

  /** Réécrit l'empreinte et le total d'un devis en attente (après `keeping`). */
  abstract save(quote: PeriodQuote): Promise<void>;

  /** Le devis relu, ou `null`. */
  abstract load(quoteId: string): Promise<PeriodQuote | null>;

  /**
   * **Le renvoi d'une nouvelle version** (QD5, v5 S4), dans la transaction du
   * geste et dans cet ordre : l'ancienne passe `superseded` — la clé
   * étrangère composite met ses commandes à jour —, PUIS la nouvelle et ses
   * commandes sont insérées, sans `ON CONFLICT` : un conflit est une erreur.
   *
   * @throws {PeriodQuoteNotAwaitingError} l'ancienne n'était plus en attente.
   * @throws {PeriodQuoteResendConflictError} la base refuse la nouvelle.
   */
  abstract replace(superseded: PeriodQuote, successor: PeriodQuote): Promise<void>;
}

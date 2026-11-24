/**
 * **« Engagement reçu »** sur un devis de période (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD6) — un geste de la
 * comptabilité : l'organisme a renvoyé son numéro d'engagement ; il s'écrit
 * sur les commandes du devis, et la facture du devis s'émet.
 */
export class ReceivePeriodQuoteCommitmentCommand {
  constructor(
    readonly quoteId: string,
    /** Le numéro tel que saisi ; sa forme se juge sur chaque commande (`BudgetCommitment`). */
    readonly number: string,
    /** La fiche du staff qui enregistre : l'intention est à elle seule. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un rejeu ne réémet pas. */
    readonly intentKey: string,
  ) {}
}

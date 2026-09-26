/** Ce que la passe a trouvé en retard — la seule observabilité d'un cron. */
export interface SettlementRemindersReport {
  /** Commandes dont l'heure limite est passée sans règlement — rappelées maintenant ou déjà. */
  readonly overdue: number;
}

/**
 * **Prévenir le commercial** qu'une commande saisie par l'équipe, avec lien de
 * paiement, n'est pas réglée à l'heure limite de sa journée (plan
 * `documentation/order/plan-abandon-du-reglement.md`, Q6, S5).
 *
 * Sans charge utile : c'est une passe horaire sur tout le commerce, déclenchée
 * par un Cron Trigger. Rejouable à volonté — une commande ne sonne qu'une fois.
 */
export class SendSettlementRemindersCommand {}

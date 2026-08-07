/**
 * Fait de domaine : **un panier récurrent vient d'être ouvert**. Signal fort du
 * module croissance — l'abonnement est le **qualifieur n°1** d'un lead engagé
 * (revenu récurrent prévisible), bien au-delà d'une commande ponctuelle.
 */
export class SubscriptionCreatedEvent {
  constructor(
    readonly subscriptionId: string,
    /** Le client connecté propriétaire du gabarit (mur du panier récurrent). */
    readonly placedByUserId: string,
    /** Cadence du gabarit (`weekly`, `monthly`…), portée dans le signal. */
    readonly recurrence: string,
  ) {}
}

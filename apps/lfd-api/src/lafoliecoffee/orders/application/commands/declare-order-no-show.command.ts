/**
 * **« Le client n'est pas venu »** — le comptoir déclare non retirée une
 * commande à régler en boutique, après la fin de son créneau
 * (`plan-commande-particulier-reglee-en-boutique.md`, § 5 bis).
 *
 * `staffUserId` est l'id de la FICHE, reçu de la porte — jamais du corps.
 */
export class DeclareOrderNoShowCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`). */
    readonly intentKey: string,
  ) {}
}

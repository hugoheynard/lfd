/**
 * **Le client connecté annule une commande** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, lot C6, C6.6).
 *
 * `userId` vient du `Principal`, jamais du corps ; aucun id de société n'est
 * reçu — le mur se lit sur la société DE LA COMMANDE (C6.2). Le motif est
 * brut et facultatif : le domaine le valide (`CustomerCancellationReason`).
 */
export class CancelOrderByCustomerCommand {
  constructor(
    readonly userId: string,
    readonly orderId: string,
    readonly reasonCode: string | undefined,
    readonly reasonText: string | undefined,
  ) {}
}

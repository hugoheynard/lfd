/**
 * **Payer par la page d'un lien** : l'intention du premier paiement du sujet,
 * créée à la première ouverture, relue aux suivantes.
 */
export class StartPayLinkPaymentCommand {
  constructor(readonly token: string) {}
}

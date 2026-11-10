/**
 * **Un webhook de l'endpoint des liens de paiement arrive** (plan M2, §4.5) —
 * émise par le contrôleur public, jamais depuis une requête client. `rawBody`
 * est le corps BRUT : Stripe signe les octets exacts.
 */
export class RecordPaymentLinkEventCommand {
  constructor(
    readonly rawBody: Buffer,
    readonly signature: string,
  ) {}
}

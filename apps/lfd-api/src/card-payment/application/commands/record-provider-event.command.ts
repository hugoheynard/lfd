/**
 * **Un webhook du prestataire d'un compte arrive** (plan M2, §3.3 : « le
 * webhook est une commande ») — émise par le contrôleur public, jamais depuis
 * une requête client.
 *
 * `rawBody` est le corps BRUT : le prestataire signe les octets exacts, un
 * JSON re-sérialisé casserait la signature. `account` est le segment du
 * chemin (`/payments/webhook/:account`), non vérifié : c'est le handler qui
 * le confronte au registre.
 */
export class RecordProviderEventCommand {
  constructor(
    readonly account: string,
    readonly rawBody: Buffer,
    readonly signature: string,
  ) {}
}

/**
 * **Dater une commande déjà remise qui n'a pas de date de réception** — la
 * reprise du plan `documentation/commandes/plan-date-de-reception.md`, §8.
 *
 * Envoyée par le script d'exploitation `ops:received-on-backfill`, une fois
 * par commande `handed_over_at IS NOT NULL AND received_on IS NULL`.
 * `handedOverAt` est l'instant de la remise relu sur la commande : il sert de
 * repli quand aucune attestation de retrait n'est lisible.
 */
export class BackfillOrderReceivedOnCommand {
  constructor(
    readonly orderId: string,
    readonly handedOverAt: Date,
  ) {}
}

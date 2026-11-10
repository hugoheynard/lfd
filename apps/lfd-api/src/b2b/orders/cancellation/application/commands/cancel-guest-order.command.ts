/**
 * **L'invité annule sa commande par le lien de son courriel** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.4).
 * Le jeton arrive dans le CORPS (S7), jamais dans un chemin.
 */
export class CancelGuestOrderCommand {
  constructor(
    readonly orderId: string,
    readonly token: string,
    readonly reasonCode: string | undefined,
    readonly reasonText: string | undefined,
  ) {}
}

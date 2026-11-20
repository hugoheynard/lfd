/**
 * **« Prévenir le client »** — la supervision du comptoir demande l'e-mail
 * « commande non retirée » pour une commande déclarée non retirée
 * (`plan-commande-particulier-reglee-en-boutique.md`, § 5 bis).
 *
 * `staffUserId` est l'id de la FICHE, reçu de la porte — jamais du corps.
 */
export class RequestNoShowNoticeCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`). */
    readonly intentKey: string,
  ) {}
}

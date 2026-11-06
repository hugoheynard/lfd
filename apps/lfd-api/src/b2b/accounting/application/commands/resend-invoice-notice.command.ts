/**
 * **Renvoyer l'e-mail « Votre facture »** d'une pièce émise (plan
 * `facture-emise.md`) — un geste du staff
 * comptable, après un échec au journal ou une adresse corrigée.
 */
export class ResendInvoiceNoticeCommand {
  constructor(
    readonly invoiceId: string,
    /** La fiche du staff qui renvoie : l'intention est à elle seule. */
    readonly staffUserId: string,
    /**
     * La clé d'intention fabriquée par l'écran (en-tête `Idempotency-Key`,
     * plan `plan-service-e-mails.md`, revue, cas 4) : un second clic de même
     * clé ne réexécute rien ; un vrai renvoi en porte une neuve.
     */
    readonly intentKey: string,
  ) {}
}

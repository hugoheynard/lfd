/**
 * Envoyer au client **son mandat à signer**, en pièce jointe.
 *
 * Vise le mandat par son identifiant, comme la signature : c'est le document
 * qu'on envoie, pas « celui de cette société ».
 */
export class SendMandateCommand {
  constructor(
    readonly companyId: string,
    readonly mandateId: string,
    /** La fiche du staff qui envoie : l'intention est à elle seule. */
    readonly staffUserId: string,
    /**
     * La clé d'intention fabriquée par l'écran (en-tête `Idempotency-Key`,
     * plan `plan-service-e-mails.md`, revue, cas 4) : un second clic de même
     * clé ne réexécute rien ; un vrai renvoi en porte une neuve.
     */
    readonly intentKey: string,
  ) {}
}

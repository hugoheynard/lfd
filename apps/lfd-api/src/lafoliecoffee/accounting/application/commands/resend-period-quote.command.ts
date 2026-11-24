/**
 * **« Renvoyer le devis »** (plan `plan-clients-publics-chorus.md`, § 6
 * sexies, QD4 et QD5) — un geste de la comptabilité : après une adresse
 * corrigée, ou quand les commandes du devis ont changé (une nouvelle version
 * est alors rangée et part).
 */
export class ResendPeriodQuoteCommand {
  constructor(
    readonly quoteId: string,
    /** La fiche du staff qui renvoie : l'intention est à elle seule. */
    readonly staffUserId: string,
    /**
     * La clé d'intention fabriquée par l'écran (en-tête `Idempotency-Key`) :
     * un second clic de même clé ne réexécute rien ; un vrai renvoi en porte
     * une neuve, et c'est elle qui fait la clé de l'e-mail — un renvoi de la
     * même version part bien.
     */
    readonly intentKey: string,
  ) {}
}

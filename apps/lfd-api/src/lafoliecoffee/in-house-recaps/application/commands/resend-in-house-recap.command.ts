/**
 * **« Renvoyer l'e-mail »** d'un récapitulatif (`plan-restaurants-maison.md`,
 * D10) : après une adresse corrigée, ou quand l'émission n'a pas pu produire
 * le PDF — il est alors rendu et rangé avant l'envoi.
 */
export class ResendInHouseRecapCommand {
  constructor(
    readonly recapId: string,
    /** La fiche du staff qui renvoie : l'intention est à elle seule. */
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un second
     * clic de même clé ne renvoie rien ; un vrai renvoi en porte une neuve,
     * et c'est elle qui fait la clé de l'e-mail.
     */
    readonly intentKey: string,
  ) {}
}

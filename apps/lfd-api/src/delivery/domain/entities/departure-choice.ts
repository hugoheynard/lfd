/**
 * Qui a posé un réglage, figé à l'instant du geste : l'id de fiche survit à
 * tout, le nom et le rôle sont un instantané. Vides quand l'annuaire ne
 * connaît pas l'auteur — on n'invente pas un nom.
 */
export interface DeliveryAuthor {
  readonly staffUserId: string;
  readonly name: string;
  readonly role: string;
}

/**
 * **Le point de départ choisi** — un point de retrait RÉFÉRENCÉ par son
 * identifiant opaque, jamais recopié : l'adresse du labo n'a qu'une source, le
 * commerce.
 *
 * Pas un agrégat : un réglage sans transition (`CLAUDE.md` §3.1). Ce que la
 * classe garantit est la trace — un choix porte toujours son instant et son
 * auteur. Que le point existe se vérifie contre le commerce, par le handler.
 */
export class DepartureChoice {
  private constructor(
    readonly pickupAddressId: string,
    readonly at: Date,
    readonly author: DeliveryAuthor,
  ) {}

  static choose(input: {
    readonly pickupAddressId: string;
    readonly at: Date;
    readonly author: DeliveryAuthor;
  }): DepartureChoice {
    return new DepartureChoice(input.pickupAddressId, input.at, input.author);
  }
}

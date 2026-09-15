/**
 * Le panier en cours de cette personne dans cet espace, s'il y en a un.
 * `companyId` `null` = le perso ; il vient de la porte, jamais du client.
 */
export class GetShopCartQuery {
  constructor(
    readonly userId: string,
    readonly companyId: string | null,
  ) {}
}

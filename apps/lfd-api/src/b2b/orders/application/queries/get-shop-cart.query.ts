/** Le panier en cours de cette personne, s'il y en a un. */
export class GetShopCartQuery {
  constructor(readonly userId: string) {}
}

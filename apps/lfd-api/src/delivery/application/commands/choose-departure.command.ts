/**
 * Choisir le point de retrait d'où partent les tournées. Acte **staff** :
 * `staffUserId` est figé dans la ligne avec le nom et le rôle de l'agent.
 */
export class ChooseDepartureCommand {
  constructor(
    readonly pickupAddressId: string,
    readonly staffUserId: string,
  ) {}
}

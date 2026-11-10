import type { OrderOpeningPatch } from "@lfd/contracts";

/**
 * Ouvrir ou fermer la boutique à la commande pour une clientèle. Acte
 * **staff** : `staffUserId` est figé dans la ligne avec le nom et le rôle.
 */
export class UpdateOrderOpeningCommand {
  constructor(
    readonly patch: OrderOpeningPatch,
    readonly staffUserId: string,
  ) {}
}

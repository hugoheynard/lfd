import type { CreateSubAccountPayload } from "@lfd/contracts";

/**
 * Commande **staff** : créer un sous-compte de `parentId` (plan
 * `sous-comptes.md`, §4) — identité, première adresse de livraison, puis
 * les aspects à suivre. Il naît `pending`, comme toute création staff, et
 * s'active par le chemin existant.
 */
export class CreateSubAccountCommand {
  constructor(
    readonly parentId: string,
    readonly payload: CreateSubAccountPayload,
    /**
     * L'agent a-t-il le droit de tarification en écriture ? Suivre `pricing`
     * est une décision du commercial (Q9) : la route de la fiche ne le porte
     * pas, c'est donc à la commande de le dire.
     */
    readonly mayDecidePricing: boolean,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}

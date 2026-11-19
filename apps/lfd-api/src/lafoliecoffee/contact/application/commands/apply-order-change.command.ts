import type { ChangeItemLimits } from "../../domain/ports/order-change.applier.js";

/**
 * **Appliquer une demande de modification** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)). Acte
 * **staff** : la révision est faite au nom de cette fiche. Rend la révision
 * produite. `expectedTotalCents` : le TTC du devis que l'équipe a vu (doc
 * `modifier-une-commande.md`, §2.3 (R14) — une délégation, le vu est celui de l'équipe).
 * `itemLimits` : son droit de passer outre la limite d'un produit, lu en base
 * par le contrôleur, et son motif.
 */
export class ApplyOrderChangeCommand {
  constructor(
    readonly requestId: string,
    readonly staffUserId: string,
    readonly expectedTotalCents: number,
    readonly itemLimits: ChangeItemLimits,
  ) {}
}

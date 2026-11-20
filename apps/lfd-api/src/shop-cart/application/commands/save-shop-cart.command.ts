import type { ShopCartPayload } from "@lfd/contracts";

/**
 * Met le panier de côté pour cette personne, dans cet espace de travail.
 *
 * `userId` et `companyId` viennent de la **porte**, jamais du corps : on ne
 * choisit ni le panier qu'on écrit ni la société pour laquelle on le compose.
 * `companyId` `null` = le perso. Le même parti que partout ailleurs sur cette
 * surface.
 */
export class SaveShopCartCommand {
  constructor(
    readonly userId: string,
    readonly companyId: string | null,
    readonly payload: ShopCartPayload,
  ) {}
}

import type { ShopCartPayload } from "@lfd/contracts";

/**
 * Met le panier de côté pour cette personne.
 *
 * `userId` vient de la **porte**, jamais du corps : on ne choisit pas le panier
 * qu'on écrit. Le même parti que partout ailleurs sur cette surface.
 */
export class SaveShopCartCommand {
  constructor(
    readonly userId: string,
    readonly payload: ShopCartPayload,
  ) {}
}

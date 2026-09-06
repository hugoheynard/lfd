import type { ShopCartView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ShopCartRepository } from "../../domain/ports/shop-cart.repository.js";
import { SaveShopCartCommand } from "./save-shop-cart.command.js";

/**
 * Enregistre le panier d'une personne — création ou remplacement.
 *
 * **Aucune règle, et c'est la règle.** Ni société à vérifier — le panier
 * n'appartient à aucune —, ni existence à contrôler : le `userId` vient du
 * `Principal`, donc de notre base, résolu par le guard avant d'arriver ici.
 *
 * Rien n'est vérifié du **contenu** non plus. Un SKU retiré de la vente depuis
 * la mise de côté ne rend pas le panier invalide : il disparaîtra du décompte,
 * que le devis projette déjà à travers le catalogue. Un panier qu'on refuserait
 * de garder parce qu'une de ses lignes ne passerait plus serait un panier qui ne
 * sert à rien — et le refus tomberait sur le geste suivant du client, pour une
 * ligne dont il ne sait rien.
 */
@CommandHandler(SaveShopCartCommand)
export class SaveShopCartHandler implements ICommandHandler<SaveShopCartCommand, ShopCartView> {
  constructor(private readonly carts: ShopCartRepository) {}

  execute(command: SaveShopCartCommand): Promise<ShopCartView> {
    return this.carts.save(command.userId, command.payload);
  }
}

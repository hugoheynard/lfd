import type { ShopCartView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ShopCartRepository } from "../../domain/ports/shop-cart.repository.js";
import { SaveShopCartCommand } from "./save-shop-cart.command.js";
import { SaleReferenceIntake } from "../../../catalog/application/sale-reference-intake.service.js";

/**
 * Enregistre le panier d'une personne dans un espace — création ou
 * remplacement.
 *
 * **Aucune règle, et c'est la règle.** Ni société à vérifier — celle de l'espace
 * est la société agissante, déjà confrontée aux rattachements par la porte —, ni
 * existence à contrôler : le `userId` vient du `Principal`, donc de notre base,
 * résolu par le guard avant d'arriver ici.
 *
 * Rien n'est vérifié du **contenu** non plus. Un SKU retiré de la vente depuis
 * la mise de côté ne rend pas le panier invalide : il disparaîtra du décompte,
 * que le devis projette déjà à travers le catalogue. Un panier qu'on refuserait
 * de garder parce qu'une de ses lignes ne passerait plus serait un panier qui ne
 * sert à rien — et le refus tomberait sur le geste suivant du client, pour une
 * ligne dont il ne sait rien.
 *
 * Une ancienne référence de vente est réécrite sous l'article qu'elle désigne
 * (`plan-defaut-sous-sa-reference.md`, § 5) : le panier gardé se normalise à
 * sa prochaine écriture, sans migration de son JSON.
 */
@CommandHandler(SaveShopCartCommand)
export class SaveShopCartHandler implements ICommandHandler<SaveShopCartCommand, ShopCartView> {
  constructor(
    private readonly carts: ShopCartRepository,
    private readonly intake: SaleReferenceIntake,
  ) {}

  async execute(command: SaveShopCartCommand): Promise<ShopCartView> {
    const lines = await this.intake.normalized(command.payload.lines, "shop_cart");
    return this.carts.save(command.userId, command.companyId, {
      ...command.payload,
      lines: [...lines],
    });
  }
}

import type { ShopCatalogueView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ShopCataloguePricing } from "../shop-catalogue-pricing.service.js";

/**
 * **Ce qui est en vente**, pour une vitrine publique.
 *
 * Une lecture nommée plutôt qu'un port injecté dans le contrôleur : elle a un
 * cas d'usage — hydrater la boutique — et il doit se tester, se réutiliser et se
 * journaliser sans passer par HTTP.
 */
export class ReadShopCatalogueQuery {}

@QueryHandler(ReadShopCatalogueQuery)
export class ReadShopCatalogueHandler implements IQueryHandler<ReadShopCatalogueQuery> {
  constructor(private readonly pricing: ShopCataloguePricing) {}

  /**
   * Le catalogue vendable, **au prix qu'un visiteur paiera**.
   *
   * 🔴 **`companyId: null`, et c'est la seule différence avec la route
   * reconnue.** Un visiteur n'a rien négocié, donc aucune mercuriale n'est lue —
   * mais une promotion publique, elle, ne demande aucun client. Cette route a
   * servi le prix **canonique** jusqu'au 2026-09-09 : une promotion `audience:
   * all` était invisible au rayon et n'apparaissait qu'au panier (R22).
   *
   * Ce qui est vendable et son rangement viennent de `shopCatalogueOf` ; le prix
   * vient de `ShopCataloguePricing`, que la route reconnue appelle à
   * l'identique. Deux implémentations auraient divergé — c'est exactement
   * comment ce trou s'est ouvert.
   */
  async execute(): Promise<ShopCatalogueView> {
    return this.pricing.priced(null);
  }
}

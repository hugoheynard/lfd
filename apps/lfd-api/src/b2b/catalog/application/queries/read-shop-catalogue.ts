import type { ContentLocale, ShopCatalogueView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { ShopAudience } from "../../domain/ports/catalog.reader.js";
import { ShopCataloguePricing } from "../shop-catalogue-pricing.service.js";

/**
 * **Ce qui est en vente**, pour une vitrine publique.
 *
 * Une lecture nommée plutôt qu'un port injecté dans le contrôleur : elle a un
 * cas d'usage — hydrater la boutique — et il doit se tester, se réutiliser et se
 * journaliser sans passer par HTTP.
 */
export class ReadShopCatalogueQuery {
  /**
   * @param language la langue des noms, lignes et rayons — le français par défaut à la route.
   * @param audience la clientèle de la vitrine — `public` par défaut à la route ;
   * `pro` est le rayon des pros au tarif pro de BASE (2026-10-19).
   */
  constructor(
    readonly language: ContentLocale,
    readonly audience: ShopAudience = "public",
  ) {}
}

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
  async execute(query: ReadShopCatalogueQuery): Promise<ShopCatalogueView> {
    // 🔴 **Le rayon pro sans jeton** (Hugo, 2026-10-19) : le visiteur venu de
    // la landing `/pro` voit le tarif pro de BASE, hors taxe — celui d'un pro
    // sans mercuriale, sans règle visant une société, sans engagement. La
    // porte ne reçoit aucune société (`companyId: null`) : rien de négocié ne
    // peut s'y lire, par construction et non par filtre. Les conditions
    // négociées restent derrière la connexion (`/shop/catalogue/mine`).
    if (query.audience === "pro") {
      return this.pricing.pricedWithoutCompany("pro", query.language);
    }
    return this.pricing.priced(null, query.language);
  }
}

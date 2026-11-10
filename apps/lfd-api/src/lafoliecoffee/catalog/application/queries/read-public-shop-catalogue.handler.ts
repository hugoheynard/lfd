import type { ShopCatalogueView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PublicShelfCacheability, type PublicShelfReply } from "../public-shelf-cacheability.js";
import { ShopCataloguePricing } from "../shop-catalogue-pricing.service.js";
import { ReadPublicShopCatalogueQuery } from "./read-public-shop-catalogue.query.js";
import { ReadShopCatalogueQuery, shopCatalogueFor } from "./read-shop-catalogue.js";

/**
 * La vitrine publique, calculée comme toujours (`shopCatalogueFor`), et la
 * décision de la laisser garder par Workers Cache. Le rayon est servi dans
 * tous les cas ; seul l'en-tête dépend de la décision.
 *
 * 🔴 Ne lit jamais l'appelant (vérifié le 2026-11-04 : ni principal, ni
 * société, ni en-tête — `shopCatalogueFor` passe `companyId: null`) : c'est
 * ce qui rend `public` juste même pour une requête qui porte un jeton.
 */
@QueryHandler(ReadPublicShopCatalogueQuery)
export class ReadPublicShopCatalogueHandler implements IQueryHandler<
  ReadPublicShopCatalogueQuery,
  PublicShelfReply<ShopCatalogueView>
> {
  constructor(
    private readonly pricing: ShopCataloguePricing,
    private readonly cacheability: PublicShelfCacheability,
  ) {}

  execute(query: ReadPublicShopCatalogueQuery): Promise<PublicShelfReply<ShopCatalogueView>> {
    return this.cacheability.around(() =>
      shopCatalogueFor(this.pricing, new ReadShopCatalogueQuery(query.language, query.audience)),
    );
  }
}

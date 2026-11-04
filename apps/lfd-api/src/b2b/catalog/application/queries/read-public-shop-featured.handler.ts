import type { ShopFeaturedView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CatalogOperationsReader } from "../../domain/ports/catalog-operations.reader.js";
import { CatalogReader } from "../../domain/ports/catalog.reader.js";
import { PublicShelfCacheability, type PublicShelfReply } from "../public-shelf-cacheability.js";
import { ReadPublicShopFeaturedQuery } from "./read-public-shop-featured.query.js";
import { ReadShopFeaturedQuery } from "./read-shop-featured.query.js";
import { shopFeaturedFor } from "./read-shop-featured.handler.js";

/**
 * Les incontournables, lus comme toujours (`shopFeaturedFor`), et la décision
 * de les laisser garder par Workers Cache.
 *
 * 🔴 Ne lit jamais l'appelant (vérifié le 2026-11-04 : `anonymousViewer`,
 * aucune société) : c'est ce qui rend `public` juste même pour une requête qui
 * porte un jeton.
 */
@QueryHandler(ReadPublicShopFeaturedQuery)
export class ReadPublicShopFeaturedHandler implements IQueryHandler<
  ReadPublicShopFeaturedQuery,
  PublicShelfReply<ShopFeaturedView>
> {
  constructor(
    private readonly catalog: CatalogReader,
    private readonly operations: CatalogOperationsReader,
    private readonly clock: Clock,
    private readonly cacheability: PublicShelfCacheability,
  ) {}

  execute(query: ReadPublicShopFeaturedQuery): Promise<PublicShelfReply<ShopFeaturedView>> {
    const { catalog, operations, clock } = this;
    return this.cacheability.around(() =>
      shopFeaturedFor(
        { catalog, operations, clock },
        new ReadShopFeaturedQuery(query.audience, query.language),
      ),
    );
  }
}

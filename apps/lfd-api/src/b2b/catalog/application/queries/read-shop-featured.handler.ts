import type { ShopFeaturedItemView, ShopFeaturedView, ShopItemView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CatalogOperationsReader } from "../../domain/ports/catalog-operations.reader.js";
import { CatalogReader } from "../../domain/ports/catalog.reader.js";
import { inShopLanguage, shopCatalogueOf } from "../shop-catalogue-view.js";
import { ReadShopFeaturedQuery } from "./read-shop-featured.query.js";
import { anonymousViewer } from "../../domain/catalog-viewer.js";

@QueryHandler(ReadShopFeaturedQuery)
export class ReadShopFeaturedHandler implements IQueryHandler<ReadShopFeaturedQuery> {
  constructor(
    private readonly catalog: CatalogReader,
    private readonly operations: CatalogOperationsReader,
    private readonly clock: Clock,
  ) {}

  /**
   * Les articles mis en avant pour l'audience, **tels que sa vitrine les
   * montre** : même lecture (`listSellable`, donc masquage, validation et
   * audience par `servedTo`), même composition (`shopCatalogueOf`, donc
   * opérations datées et unité par défaut). Un incontournable qu'un pro
   * connecté ne verrait pas au rayon ne sort pas ici. L'ordre est celui du
   * rayon : la mise en avant n'a pas d'ordre propre (vérifié le 2026-10-19 —
   * un booléen par audience sur la décision, sans position).
   *
   * 🔴 **Sans prix** (Hugo, 2026-10-19) : un prix pro dépend de la société
   * (mercuriale, remises, tarif de canal). À un visiteur anonyme on n'en
   * montre aucun — d'où la projection explicite plutôt qu'un `Omit`, qui
   * laisserait passer tout champ de prix ajouté plus tard à `ShopItemView`.
   */
  execute(query: ReadShopFeaturedQuery): Promise<ShopFeaturedView> {
    const { catalog, operations, clock } = this;
    return shopFeaturedFor({ catalog, operations, clock }, query);
  }
}

/** Ce que la lecture des incontournables lit — rien qui désigne l'appelant. */
export interface ShopFeaturedSources {
  readonly catalog: CatalogReader;
  readonly operations: CatalogOperationsReader;
  readonly clock: Clock;
}

/**
 * Le corps de {@link ReadShopFeaturedHandler}, partagé avec la route HTTP qui
 * décide en plus si la réponse se garde (`ReadPublicShopFeaturedHandler`, C3).
 *
 * 🔴 Ne lit JAMAIS l'appelant (`anonymousViewer`) : c'est ce qui rend `public`
 * juste sur `GET /shop/featured` (`lint:cache-control` le tient).
 */
export async function shopFeaturedFor(
  sources: ShopFeaturedSources,
  query: ReadShopFeaturedQuery,
): Promise<ShopFeaturedView> {
  const [sellable, operations, operationOnlySkus] = await Promise.all([
    // Route `@Public()`, sans société : le pro y est anonyme (§ 6).
    sources.catalog.listSellable(anonymousViewer(query.audience)),
    sources.operations.sellableOperations(),
    sources.operations.operationOnlySkus(),
  ]);
  const catalogue = shopCatalogueOf(sellable, {
    operations,
    operationOnlySkus,
    audience: query.audience,
    now: sources.clock.now(),
  });
  const featured = { ...catalogue, items: catalogue.items.filter((item) => item.isFeatured) };
  return inShopLanguage(featured, sellable, query.language).items.map(toFeatured);
}

function toFeatured(item: ShopItemView): ShopFeaturedItemView {
  return {
    sku: item.sku,
    name: item.name,
    note: item.note,
    image: item.image,
    thumbnail: item.thumbnail,
    shelfId: item.shelfId,
  };
}

import type { ShopFeaturedItemView, ShopFeaturedView, ShopItemView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CatalogOperationsReader } from "../../domain/ports/catalog-operations.reader.js";
import { CatalogReader } from "../../domain/ports/catalog.reader.js";
import { inShopLanguage, shopCatalogueOf } from "../shop-catalogue-view.js";
import { ReadShopFeaturedQuery } from "./read-shop-featured.query.js";

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
  async execute(query: ReadShopFeaturedQuery): Promise<ShopFeaturedView> {
    const [sellable, operations, operationOnlySkus] = await Promise.all([
      this.catalog.listSellable(query.audience),
      this.operations.sellableOperations(),
      this.operations.operationOnlySkus(),
    ]);
    const catalogue = shopCatalogueOf(sellable, {
      operations,
      operationOnlySkus,
      audience: query.audience,
      now: this.clock.now(),
    });
    const featured = { ...catalogue, items: catalogue.items.filter((item) => item.isFeatured) };
    return inShopLanguage(featured, sellable, query.language).items.map(toFeatured);
  }
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

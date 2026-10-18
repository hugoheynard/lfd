import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";

/**
 * Port de **lecture** : la famille de chaque article du panier, lignée
 * comprise, telle que le catalogue SERVI à ce lecteur la range. Ce que juge un
 * déclencheur « famille au panier ».
 */
export abstract class CartFamilyReader {
  /** SKU → lignée (la famille d'abord). Un SKU non servi ou sans famille est absent. */
  abstract pathsOf(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, readonly string[]>>;
}

import { Injectable } from "@nestjs/common";
import { shopSkuOf } from "../domain/shop-sku.js";

import { CatalogReader } from "../domain/ports/catalog.reader.js";

/**
 * **Quels articles se vendent au poids**, parmi ceux d'un panier qui n'en
 * accepte pas (`documentation/pricing/vente-au-poids.md`, §2 « hors de ce
 * plan ») : abonnements, engagements de volume, réassort. Leurs quantités sont
 * des pièces sans unité ; un article au poids y serait compté mille fois.
 *
 * Par SKU produit, la clé que ces vendeurs portent, comme `SaleOperations`.
 * Les deux audiences sont lues : un article au poids ne l'est pas moins parce
 * qu'il n'est servi qu'aux particuliers.
 */
@Injectable()
export class ArticleSaleUnits {
  constructor(private readonly catalog: CatalogReader) {}

  /** Les SKU produit de la liste qui se vendent au poids — vide si aucun. */
  async weightSoldAmong(productSkus: readonly string[]): Promise<ReadonlySet<string>> {
    const skus = [...new Set(productSkus)];
    if (skus.length === 0) {
      return new Set();
    }
    const [pro, open] = await Promise.all([
      this.catalog.listByShopSkus(skus, "pro"),
      this.catalog.listByShopSkus(skus, "public"),
    ]);
    return new Set(
      [...pro.values(), ...open.values()]
        .filter((item) => item.saleUnit === "weight")
        .map((item) => shopSkuOf(item)),
    );
  }
}

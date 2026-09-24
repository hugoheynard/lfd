import type {
  CatalogAdminItemView,
  StorefrontCatalogItem,
  StorefrontCatalogShelf,
  StorefrontCatalogView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { CatalogAdminReader } from "../../catalog/domain/ports/catalog-admin.reader.js";
import { StorefrontCatalogReader } from "../domain/storefront-catalog.reader.js";

/**
 * Un article est-il en vente quelque part ? Masqué des DEUX boutiques, non :
 * aucune ne le résoudra, et sa case retomberait au reste du rayon (D4). Même
 * définition que l'éditeur retenait en lisant `/admin/catalog` (2026-09-24).
 */
function isServed(item: CatalogAdminItemView): boolean {
  return !(item.isHidden && item.isHiddenPublic);
}

/**
 * Le catalogue d'administration réduit à ce que la vitrine désigne.
 *
 * - **le SKU du produit**, jamais celui de la déclinaison : c'est lui que la
 *   boutique sert (`catalog/application/shop-catalogue-view.ts` rend
 *   `productSku`). Un produit paraît une fois ; il est servi si l'une de ses
 *   lignes l'est, et porte le nom et le rayon de sa première ligne servie —
 *   de sa première ligne tout court s'il n'en a aucune ;
 * - **les rayons** : les familles qui portent au moins un article servi, dans
 *   l'ordre où le catalogue les rend.
 */
export function storefrontCatalogOf(lines: readonly CatalogAdminItemView[]): StorefrontCatalogView {
  const items = new Map<string, StorefrontCatalogItem>();
  const shelves = new Map<string, StorefrontCatalogShelf>();
  for (const line of lines) {
    const served = isServed(line);
    const known = items.get(line.productSku);
    if (known === undefined || (served && !known.served)) {
      items.set(line.productSku, {
        sku: line.productSku,
        name: line.name,
        shelfKey: line.categoryId,
        served,
      });
    }
    if (served && !shelves.has(line.categoryId)) {
      shelves.set(line.categoryId, { key: line.categoryId, name: line.categoryName });
    }
  }
  return { shelves: [...shelves.values()], items: [...items.values()] };
}

/**
 * Adaptateur du port de la vitrine sur `CatalogAdminReader` : il lit le
 * catalogue par le port que `b2b/catalog` publie, et n'en garde que ce que
 * l'éditeur désigne. Les prix et décisions ne sortent pas d'ici.
 */
@Injectable()
export class CatalogBackedStorefrontCatalogReader extends StorefrontCatalogReader {
  constructor(private readonly catalog: CatalogAdminReader) {
    super();
  }

  async read(): Promise<StorefrontCatalogView> {
    return storefrontCatalogOf(await this.catalog.list());
  }
}

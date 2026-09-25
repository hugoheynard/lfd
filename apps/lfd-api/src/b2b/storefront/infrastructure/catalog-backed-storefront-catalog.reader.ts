import type {
  CatalogAdminItemView,
  StorefrontCatalogItem,
  StorefrontCatalogOperation,
  StorefrontCatalogShelf,
  StorefrontCatalogView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { CatalogAdminReader } from "../../catalog/domain/ports/catalog-admin.reader.js";
import { ReceivedOperationsReader } from "../../catalog/domain/ports/received-operations.reader.js";
import { StorefrontCatalogReader } from "../domain/storefront-catalog.reader.js";
import { operationShelvesOf, storefrontOperationsOf } from "./storefront-catalog-operations.js";

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
 * - **les rayons** : ceux des opérations reçues non retirées (`op:<key>`), en
 *   tête comme en boutique (D8), puis les familles qui portent au moins un
 *   article servi, dans l'ordre où le catalogue les rend ;
 * - **les opérations** qu'une annonce peut désigner (D11).
 */
export function storefrontCatalogOf(
  lines: readonly CatalogAdminItemView[],
  operations: readonly StorefrontCatalogOperation[] = [],
): StorefrontCatalogView {
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
      shelves.set(line.categoryId, {
        key: line.categoryId,
        name: line.categoryName,
        operation: false,
      });
    }
  }
  return {
    shelves: [...operationShelvesOf(operations), ...shelves.values()],
    items: [...items.values()],
    operations: [...operations],
  };
}

/**
 * Adaptateur du port de la vitrine sur `CatalogAdminReader` et
 * `ReceivedOperationsReader` : il lit le catalogue par les ports que
 * `b2b/catalog` publie, et n'en garde que ce que l'éditeur désigne. Les prix,
 * décisions et surcharges ne sortent pas d'ici.
 */
@Injectable()
export class CatalogBackedStorefrontCatalogReader extends StorefrontCatalogReader {
  constructor(
    private readonly catalog: CatalogAdminReader,
    private readonly operations: ReceivedOperationsReader,
    private readonly clock: Clock,
  ) {
    super();
  }

  async read(): Promise<StorefrontCatalogView> {
    const [lines, received] = await Promise.all([this.catalog.list(), this.operations.list()]);
    return storefrontCatalogOf(lines, storefrontOperationsOf(received, this.clock.now()));
  }
}

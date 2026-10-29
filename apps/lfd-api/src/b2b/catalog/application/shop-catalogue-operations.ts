import type { ShopItemOperationView, ShopOperationView } from "@lfd/contracts";

import {
  opensAt,
  operationAccess,
  operationStateAt,
  reachesAudience,
  type OperationAccess,
} from "../domain/operation-access.js";
import type { SellableOperation } from "../domain/ports/catalog-operations.reader.js";
import type { ResolvedCatalogItem, ShopAudience } from "../domain/ports/catalog.reader.js";
import { shopSkuOf } from "../domain/shop-sku.js";

/**
 * **Ce que la vitrine sait des opérations datées, à l'instant de la requête**
 * (D5, D8 de `documentation/operations-datees/architecture-operations-datees.md`).
 *
 * Lu une fois par `ShopCataloguePricing`, puis appliqué ici sans autre
 * lecture : la vitrine est la seule route anonyme du dépôt, et la réponse de
 * D4 ne demande que ces quatre faits.
 */
export interface ShopSale {
  readonly operations: readonly SellableOperation[];
  /** Les SKU du catalogue (déclinaisons) « vendus seulement pendant une opération ». */
  readonly operationOnlySkus: ReadonlySet<string>;
  readonly audience: ShopAudience;
  readonly now: Date;
}

/** La réponse de D4 pour un article du rayon, sans jour — la vitrine n'en demande pas. */
export function shopAccessOf(item: ResolvedCatalogItem, sale: ShopSale): OperationAccess {
  return operationAccess(
    { sku: item.sku, operationOnly: sale.operationOnlySkus.has(item.sku) },
    sale.operations,
    sale.audience,
    sale.now,
  );
}

/**
 * Ce que la carte d'un article montré dit de son opération — `null` pour un
 * article courant, qui n'en porte pas (et `absent` n'arrive jamais ici : le
 * rayon l'a déjà écarté).
 */
export function itemOperationOf(
  item: ResolvedCatalogItem,
  access: OperationAccess,
  sale: ShopSale,
): ShopItemOperationView | null {
  if (access === "free" || access === "absent") {
    return null;
  }
  if (typeof access !== "string") {
    return {
      key: access.operation.key,
      state: access.reason === "not_yet_open" ? "announced" : "closed",
    };
  }
  // `shown` : une opération au moins le montre, commande ouverte — la première
  // dans l'ordre du lecteur (l'annonce la plus récente) le dit.
  const open = sale.operations.find(
    (operation) =>
      reachesAudience(operation, sale.audience) &&
      operation.skus.includes(item.sku) &&
      operationStateAt(operation, sale.now) === "open",
  );
  return open === undefined ? null : { key: open.key, state: "open" };
}

/**
 * Les opérations que la vitrine montre : à cette clientèle, dans leur fenêtre.
 * Leurs SKU passent de la déclinaison au SKU de vente (`shopSkuOf`) —
 * l'identifiant que la boutique vend.
 *
 * Le rayon d'une opération s'ouvre sur son ENCART, et c'est lui l'annonce
 * (plan « Une opération sans article ») — montré sans article pendant
 * l'annonce, et commandes ouvertes avec `awaitingProducts` ; commandes closes
 * et rien à retirer, il s'efface.
 */
export function shopOperationsOf(
  sale: ShopSale,
  shown: readonly ResolvedCatalogItem[],
): ShopOperationView[] {
  const productOf = new Map(shown.map((item) => [item.sku, shopSkuOf(item)]));
  return sale.operations.flatMap((operation) => {
    const state = operationStateAt(operation, sale.now);
    if (state === null || !reachesAudience(operation, sale.audience)) {
      return [];
    }
    const skus = operation.skus.flatMap((sku) => {
      const product = productOf.get(sku);
      return product === undefined ? [] : [product];
    });
    const empty = skus.length === 0;
    if (empty && state === "closed") {
      return [];
    }
    const view: ShopOperationView = {
      key: operation.key,
      name: operation.name,
      lede: operation.lede,
      image: operation.image,
      state,
      orderFrom: opensAt(operation).toISOString(),
      orderUntil: operation.orderUntil.toISOString(),
      pickupFrom: operation.pickupFrom,
      pickupUntil: operation.pickupUntil,
      skus,
      announceFrom: operation.announceFrom.toISOString(),
      awaitingProducts: empty && state === "open",
      showsOrderUntilTime: operation.showsOrderUntilTime ?? true,
    };
    return [view];
  });
}

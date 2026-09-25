import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import {
  operationAccess,
  orderablePickupRanges,
  type OperationAccess,
} from "../domain/operation-access.js";
import type { PickupDayRange } from "../domain/operation-days.js";
import { CatalogOperationsReader } from "../domain/ports/catalog-operations.reader.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../domain/ports/catalog.reader.js";

/** La réponse de D4 pour un article du panier, et le nom qui ira dans le message. */
export interface ProductSaleAccess {
  readonly productName: string;
  readonly access: OperationAccess;
}

/**
 * **Les opérations datées, pour ceux qui vendent par SKU PRODUIT** — la caisse,
 * le devis, les jours proposés (D5, D6 de
 * `documentation/order/architecture-operations-datees.md`).
 *
 * Pourquoi un service et pas un appel direct à `operationAccess` : une
 * opération porte les SKU du **catalogue** (la déclinaison, `PAT-002-1`), et la
 * commande porte celui du **produit** (`PAT-002`) — `CatalogBackedProductCatalog`
 * le dit. Le passage de l'un à l'autre appartient au catalogue ; recopié chez
 * chaque vendeur, il finirait par comparer deux identifiants qui ne se
 * rencontrent jamais, et la bûche passerait libre sans que rien ne rougisse.
 *
 * Il ne filtre rien lui-même : il répond, et le vendeur décide quoi en faire.
 * Le lecteur du catalogue et l'autorité de prix ne changent pas (D5) — la
 * tarification continue de voir la bûche hors fenêtre.
 *
 * Le coût : une lecture des SKU `operationOnly`, et rien de plus quand le
 * panier n'en porte aucun — le cas de tous les jours hors saison.
 */
@Injectable()
export class SaleOperations {
  constructor(
    private readonly catalog: CatalogReader,
    private readonly operations: CatalogOperationsReader,
    private readonly clock: Clock,
  ) {}

  /**
   * La réponse de D4 pour chaque article **`operationOnly`** du panier, par
   * SKU produit. Un article absent de la table rendue n'est pas contraint :
   * courant, ou inconnu — et l'inconnu est refusé ailleurs, pour ce qu'il est.
   *
   * @param fulfillmentDate cf. `operationAccess` : absent = sans jour (devis),
   *   `null` = une commande qui n'en porte pas.
   */
  async accessOf(
    productSkus: readonly string[],
    audience: ShopAudience,
    fulfillmentDate?: string | null,
  ): Promise<ReadonlyMap<string, ProductSaleAccess>> {
    const bound = await this.boundItems(productSkus, audience);
    const found = new Map<string, ProductSaleAccess>();
    if (bound.length === 0) {
      return found;
    }
    const operations = await this.operations.sellableOperations();
    const now = this.clock.now();
    for (const item of bound) {
      found.set(item.productSku, {
        productName: item.name,
        access: operationAccess(
          { sku: item.sku, operationOnly: true },
          operations,
          audience,
          now,
          fulfillmentDate,
        ),
      });
    }
    return found;
  }

  /**
   * Les plages de jours que chaque article `operationOnly` du panier peut
   * encore demander — une entrée par article contraint, aucune pour les
   * autres. Cf. `firstPickupDay`.
   */
  async pickupRangesOf(
    productSkus: readonly string[],
    audience: ShopAudience,
  ): Promise<readonly (readonly PickupDayRange[])[]> {
    const bound = await this.boundItems(productSkus, audience);
    if (bound.length === 0) {
      return [];
    }
    const operations = await this.operations.sellableOperations();
    const now = this.clock.now();
    return bound.map(
      (item) =>
        orderablePickupRanges({ sku: item.sku, operationOnly: true }, operations, audience, now) ??
        [],
    );
  }

  /**
   * Les noms des articles « vendus seulement pendant une opération » parmi
   * ces SKU produit, quelle que soit la clientèle — le drapeau est un fait de
   * la FICHE, pas de qui achète. Pour ce qui se répète sans jour d'opération :
   * l'abonnement (D6).
   */
  async operationOnlyAmong(productSkus: readonly string[]): Promise<readonly string[]> {
    const skus = [...new Set(productSkus)];
    const [pro, open] = await Promise.all([
      this.boundItems(skus, "pro"),
      this.boundItems(skus, "public"),
    ]);
    const names = new Map([...pro, ...open].map((item) => [item.productSku, item.name]));
    return skus.flatMap((sku) => {
      const name = names.get(sku);
      return name === undefined ? [] : [name];
    });
  }

  /** Les articles du panier qui ne se vendent QUE par une opération (D3). */
  private async boundItems(
    productSkus: readonly string[],
    audience: ShopAudience,
  ): Promise<readonly ResolvedCatalogItem[]> {
    if (productSkus.length === 0) {
      return [];
    }
    const only = await this.operations.operationOnlySkus();
    if (only.size === 0) {
      return [];
    }
    const items = await this.catalog.listDefaultsByProductSkus(productSkus, audience);
    return [...items.values()].filter((item) => only.has(item.sku));
  }
}

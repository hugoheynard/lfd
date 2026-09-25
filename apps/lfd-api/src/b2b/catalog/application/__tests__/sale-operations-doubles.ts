import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  CatalogOperationsReader,
  type SellableOperation,
} from "../../domain/ports/catalog-operations.reader.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../../domain/ports/catalog.reader.js";
import { SaleOperations } from "../sale-operations.service.js";

/**
 * Les doubles des opérations datées côté VENDEUR, partagés par les suites de
 * la caisse, des devis, des jours proposés et des abonnements. Ils héritent des
 * ports ; aucun `jest.fn`.
 */

/** Un article du catalogue, déclinaison `<produit>-1` — la forme que le PIM dérive. */
export function catalogItem(
  productSku: string,
  over: Partial<ResolvedCatalogItem> = {},
): ResolvedCatalogItem {
  return {
    sku: `${productSku}-1`,
    productSku,
    name: productSku,
    unitPriceMillicents: 200_000,
    pimPriceMillicents: 200_000,
    vatRate: 5.5,
    orderTimeLimit: null,
    categoryId: "cat_patis",
    categoryName: "Pâtisseries",
    isDefault: true,
    isFeatured: false,
    allergens: null,
    note: null,
    image: null,
    thumbnail: null,
    ...over,
  };
}

/** Les opérations reçues et les SKU (déclinaisons) « vendus seulement pendant une opération ». */
export class InMemoryCatalogOperations extends CatalogOperationsReader {
  constructor(
    private readonly operations: readonly SellableOperation[] = [],
    private readonly onlySkus: readonly string[] = [],
  ) {
    super();
  }

  sellableOperations(): Promise<readonly SellableOperation[]> {
    return Promise.resolve(this.operations);
  }

  operationOnlySkus(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.onlySkus));
  }
}

/**
 * Le catalogue, réduit à la lecture par SKU produit que `SaleOperations` fait.
 * Une audience peut être fermée à un article : il est alors absent, comme un
 * article sans prix public l'est au lecteur réel.
 */
export class DefaultsCatalog extends CatalogReader {
  constructor(
    private readonly items: readonly ResolvedCatalogItem[],
    private readonly closedTo: ReadonlyMap<string, ShopAudience> = new Map(),
  ) {
    super();
  }

  findSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  listSellable(): Promise<ResolvedCatalogItem[]> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  findDefaultByProductSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  listDefaultsByProductSkus(
    productSkus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.resolve(
      new Map(
        this.items
          .filter(
            (item) =>
              productSkus.includes(item.productSku) &&
              this.closedTo.get(item.productSku) !== audience,
          )
          .map((item) => [item.productSku, item] as const),
      ),
    );
  }
}

/** Le service réel, monté sur les doubles. */
export function saleOperationsOver(input: {
  readonly now: Date;
  readonly operations?: readonly SellableOperation[];
  readonly items?: readonly ResolvedCatalogItem[];
  readonly onlySkus?: readonly string[];
}): SaleOperations {
  return new SaleOperations(
    new DefaultsCatalog(input.items ?? []),
    new InMemoryCatalogOperations(input.operations ?? [], input.onlySkus ?? []),
    new FixedClock(input.now),
  );
}

/** Hors saison : aucun article n'est `operationOnly`, le service ne lit rien d'autre. */
export function noSaleOperations(now: Date): SaleOperations {
  return saleOperationsOver({ now });
}

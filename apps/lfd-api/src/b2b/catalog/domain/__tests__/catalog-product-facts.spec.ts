import {
  itemsOnSale,
  type ReceivedCatalogItem,
  type ReceivedCatalogProduct,
} from "../catalog-product-facts.js";

/** Ce qui se vend d'une fiche reçue : ses déclinaisons complètes, si elle est active. */

const ITEM = { sku: "VIE-1-1" } as const;

function product(status: ReceivedCatalogProduct["status"]): ReceivedCatalogProduct {
  return {
    productId: "p1",
    productSku: "VIE-1",
    name: "Croissant",
    categoryId: "cat_1",
    status,
    audience: "both",
    gaps: {},
    seq: 1,
    receivedAt: new Date(0),
    items: [fact()],
  };
}

function fact(): ReceivedCatalogItem {
  return {
    variantId: "var_1",
    sku: ITEM.sku,
    productId: "p1",
    productSku: "VIE-1",
    name: "Croissant",
    kind: "daily",
    categoryId: "cat_1",
    priceMillicents: 100_000,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    publicTtcCents: 120,
    publicByContext: null,
    allergens: [],
    allergenLabels: null,
    orderTimeLimit: null,
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
    requiresCold: false,
    receivedAt: new Date(0),
  };
}

describe("itemsOnSale", () => {
  it("vend les déclinaisons complètes d'une fiche active", () => {
    expect(itemsOnSale(product("active")).map((item) => item.sku)).toEqual([ITEM.sku]);
  });

  it.each(["inactive", "archived"] as const)("ne vend rien d'une fiche %s", (status) => {
    expect(itemsOnSale(product(status))).toEqual([]);
  });
});

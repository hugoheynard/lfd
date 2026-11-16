import type { CatalogFamilyView } from "@lfd/contracts";

import { article } from "../../__tests__/placement-doubles.js";
import { unplacedProductsOf } from "../unplaced-products.js";

const SAVORY: CatalogFamilyView = { id: "fam-savory", name: "Traiteur salé", position: 1 };

const ARTICLES = new Map([
  ["QUI-6", { ...article("QUI-6", "QUI", SAVORY), productName: "Quiche" }],
  ["QUI-8", { ...article("QUI-8", "QUI", SAVORY), productName: "Quiche" }],
  ["TAR-1", article("TAR-1", "TAR", SAVORY)],
  ["OLD-1", article("OLD-1", "OLD", SAVORY)],
]);

describe("unplacedProductsOf — l'alerte du Prod manager", () => {
  it("ramène les SKU du jour au produit, et ne garde que ceux sans poste", () => {
    const result = unplacedProductsOf(
      [
        { sku: "QUI-8", productName: "Quiche 8" },
        { sku: "QUI-6", productName: "Quiche 6" },
        { sku: "QUI-8", productName: "Quiche 8" },
        { sku: "TAR-1", productName: "Tarte" },
      ],
      ARTICLES,
      {
        workstations: [{ id: "ws-pat", name: "Pâtisserie", position: 0 }],
        byProduct: new Map([["TAR", "ws-pat"]]),
      },
    );

    expect(result.products).toEqual([
      { productSku: "QUI", productName: "Quiche", skus: ["QUI-6", "QUI-8"] },
    ]);
    expect(result.offCatalog).toEqual([]);
  });

  it("tient pour « à ranger » un produit dont le poste n'est plus en service", () => {
    const result = unplacedProductsOf([{ sku: "OLD-1", productName: "Vieux" }], ARTICLES, {
      workstations: [],
      byProduct: new Map([["OLD", "ws-archived"]]),
    });

    expect(result.products.map((product) => product.productSku)).toEqual(["OLD"]);
  });

  it("compte à part un SKU que le commerce ne connaît plus", () => {
    const result = unplacedProductsOf(
      [
        { sku: "GONE", productName: "Brioche retirée" },
        { sku: "GONE", productName: "Brioche retirée" },
      ],
      ARTICLES,
      { workstations: [], byProduct: new Map() },
    );

    expect(result.products).toEqual([]);
    expect(result.offCatalog).toEqual([{ sku: "GONE", productName: "Brioche retirée" }]);
  });
});

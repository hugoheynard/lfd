import type { CatalogFamilyView } from "@lfd/contracts";

import type { ProductionArticle } from "../../../../channels/commerce/index.js";
import type { WorkstationListing } from "../../../domain/ports/workstation-map.reader.js";
import { workstationsPageOf } from "../workstations-page.js";

const SAVORY: CatalogFamilyView = {
  id: "fam_savory",
  name: "Traiteur salé",
  position: 3,
  root: { id: "fam_savory", name: "Traiteur salé", position: 3 },
  path: ["fam_savory"],
};

function article(
  sku: string,
  productSku: string,
  overrides: Partial<ProductionArticle> = {},
): ProductionArticle {
  return {
    sku,
    productSku,
    productName: "Quiche lorraine",
    variantName: sku,
    family: SAVORY,
    sellable: true,
    ...overrides,
  };
}

const LISTING: WorkstationListing = {
  workstations: [{ id: "ws_pastry", name: "Pâtisserie", position: 0, trackingLevel: "detailed" }],
  placements: new Map([
    ["QUI-001", [{ workstationId: "ws_pastry", finishes: true, position: 0 }]],
    ["OLD-009", [{ workstationId: "ws_pastry", finishes: true, position: null }]],
  ]),
};

describe("workstationsPageOf — la page Postes", () => {
  it("ramène les déclinaisons à leur produit, avec son poste et son rayon", () => {
    const page = workstationsPageOf(
      LISTING,
      [
        article("QUI-001-6", "QUI-001", { variantName: "Quiche 6 parts" }),
        article("QUI-001-8", "QUI-001", { variantName: "Quiche 8 parts", sellable: false }),
        article("TAR-002-1", "TAR-002", { productName: null }),
      ],
      [],
    );

    expect(page.products[0]).toEqual({
      productSku: "QUI-001",
      productName: "Quiche lorraine",
      family: SAVORY,
      workstationId: "ws_pastry",
      position: 0,
      workstations: [{ workstationId: "ws_pastry", finishes: true, position: 0 }],
      ordered: false,
      variants: [
        { sku: "QUI-001-6", variantName: "Quiche 6 parts", sellable: true },
        { sku: "QUI-001-8", variantName: "Quiche 8 parts", sellable: false },
      ],
    });
    expect(page.products[1]).toMatchObject({
      productSku: "TAR-002",
      productName: null,
      workstationId: null,
      position: null,
    });
  });

  it("garde un produit placé que le miroir ne porte plus, sans rayon, pour pouvoir le remettre à ranger", () => {
    const page = workstationsPageOf(LISTING, [article("QUI-001-6", "QUI-001")], []);

    expect(page.products.map((product) => product.productSku)).toEqual(["QUI-001", "OLD-009"]);
    expect(page.products[1]).toMatchObject({
      family: null,
      variants: [],
      workstationId: "ws_pastry",
      position: null,
    });
  });

  it("marque ce qui est commandé, et met à part un SKU commandé que le commerce ne connaît plus", () => {
    const page = workstationsPageOf(
      LISTING,
      [article("QUI-001-6", "QUI-001"), article("TAR-002-1", "TAR-002")],
      [
        { sku: "TAR-002-1", productName: "Tarte" },
        { sku: "GONE-1", productName: "Pain disparu" },
        { sku: "GONE-1", productName: "Pain disparu" },
      ],
    );

    expect(page.products.find((product) => product.productSku === "TAR-002")?.ordered).toBe(true);
    expect(page.products.find((product) => product.productSku === "QUI-001")?.ordered).toBe(false);
    expect(page.offCatalog).toEqual([{ sku: "GONE-1", productName: "Pain disparu" }]);
  });

  it("compte les produits à ranger", () => {
    const page = workstationsPageOf(
      LISTING,
      [
        article("QUI-001-6", "QUI-001"),
        article("TAR-002-1", "TAR-002"),
        article("PAI-003-1", "PAI-003"),
      ],
      [],
    );

    expect(page.unplacedCount).toBe(2);
  });

  it("sert le niveau de suivi propre de chaque poste (niveaux de suivi, § 3.1)", () => {
    const page = workstationsPageOf(
      {
        workstations: [
          ...LISTING.workstations,
          { id: "ws_bread", name: "Boulangerie", position: 1, trackingLevel: null },
        ],
        placements: new Map(),
      },
      [],
      [],
    );

    expect(page.workstations).toEqual([
      { id: "ws_pastry", name: "Pâtisserie", position: 0, trackingLevel: "detailed" },
      { id: "ws_bread", name: "Boulangerie", position: 1, trackingLevel: null },
    ]);
  });

  it("sert tous les postes d'un produit, celui qui finit en premier, et garde `workstationId` sur lui", () => {
    const page = workstationsPageOf(
      {
        workstations: [
          { id: "ws_bread", name: "Boulangerie", position: 0, trackingLevel: null },
          { id: "ws_savory", name: "Salé traiteur", position: 1, trackingLevel: null },
          { id: "ws_cold", name: "Froid", position: 2, trackingLevel: null },
        ],
        placements: new Map([
          [
            "SAN-001",
            [
              { workstationId: "ws_cold", finishes: false, position: null },
              { workstationId: "ws_bread", finishes: false, position: 3 },
              { workstationId: "ws_savory", finishes: true, position: 1 },
            ],
          ],
        ]),
      },
      [article("SAN-001-1", "SAN-001")],
      [],
    );

    expect(page.products[0]).toMatchObject({
      productSku: "SAN-001",
      workstationId: "ws_savory",
      position: 1,
      workstations: [
        { workstationId: "ws_savory", finishes: true, position: 1 },
        { workstationId: "ws_bread", finishes: false, position: 3 },
        { workstationId: "ws_cold", finishes: false, position: null },
      ],
    });
    expect(page.unplacedCount).toBe(0);
  });

  it("un produit « à ranger » n'a aucun poste", () => {
    const page = workstationsPageOf(LISTING, [article("TAR-002-1", "TAR-002")], []);
    expect(page.products.find((product) => product.productSku === "TAR-002")).toMatchObject({
      workstationId: null,
      position: null,
      workstations: [],
    });
  });
});

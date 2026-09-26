import type { SellableOperation } from "../../domain/ports/catalog-operations.reader.js";
import type { ShopSale } from "../shop-catalogue-operations.js";
import { shopCatalogueOf } from "../shop-catalogue-view.js";
import { catalogItem } from "./sale-operations-doubles.js";

/**
 * D5, D8 : la vitrine applique les opérations datées — elle écarte la bûche
 * qu'aucune ne montre, marque ses cartes, et liste les rayons `op:<key>`.
 * `now` est un argument : les dates ne sont comparées qu'à lui.
 */

const ANNOUNCE = new Date("2026-11-01T00:00:00.000Z");
const ORDER_FROM = new Date("2026-11-15T00:00:00.000Z");
const ORDER_UNTIL = new Date("2026-12-21T11:00:00.000Z");

function noel(over: Partial<SellableOperation> = {}): SellableOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël", en: "Christmas" },
    lede: null,
    image: null,
    announceFrom: ANNOUNCE,
    orderFrom: ORDER_FROM,
    orderUntil: ORDER_UNTIL,
    pickupFrom: "2026-12-20",
    pickupUntil: "2026-12-24",
    audience: "both",
    skus: ["PAT-002-1", "VIE-001-1", "HORS-1"],
    ...over,
  };
}

const SELLABLE = [
  catalogItem("VIE-001", {
    name: "Croissant",
    categoryId: "fam-vien",
    categoryName: "Viennoiseries",
  }),
  catalogItem("PAT-002", { name: "Bûche" }),
  // Une déclinaison non vendue par la vitrine : jamais un SKU d'opération servi.
  catalogItem("PAT-002", { sku: "PAT-002-2", isDefault: false }),
];

function sale(now: Date, over: Partial<ShopSale> = {}): ShopSale {
  return {
    operations: [noel()],
    operationOnlySkus: new Set(["PAT-002-1"]),
    audience: "public",
    now,
    ...over,
  };
}

describe("shopCatalogueOf — les opérations datées", () => {
  it("hors fenêtre, écarte la bûche du rayon et ne montre aucune opération", () => {
    const view = shopCatalogueOf(SELLABLE, sale(new Date("2026-10-01T00:00:00.000Z")));

    expect(view.items.map((item) => item.sku)).toEqual(["VIE-001"]);
    expect(view.shelves.map((shelf) => shelf.id)).toEqual(["fam-vien"]);
    expect(view.operations).toEqual([]);
  });

  it("annoncée : la bûche est en rayon, sa carte dit « annoncée », le rayon op: suit", () => {
    const view = shopCatalogueOf(SELLABLE, sale(new Date("2026-11-05T00:00:00.000Z")));

    expect(view.items.find((item) => item.sku === "PAT-002")?.operation).toEqual({
      key: "noel-2026",
      state: "announced",
    });
    expect(view.operations).toEqual([
      {
        key: "noel-2026",
        name: { fr: "Noël", en: "Christmas" },
        lede: null,
        image: null,
        state: "announced",
        orderFrom: ORDER_FROM.toISOString(),
        orderUntil: ORDER_UNTIL.toISOString(),
        pickupFrom: "2026-12-20",
        pickupUntil: "2026-12-24",
        // SKU PRODUIT, dans l'ordre du référentiel, restreints à ce que la vitrine sert.
        skus: ["PAT-002", "VIE-001"],
      },
    ]);
  });

  it("le croissant de l'opération ne porte aucun état : rien ne restreint sa vente", () => {
    const view = shopCatalogueOf(SELLABLE, sale(new Date("2026-12-01T00:00:00.000Z")));

    const croissant = view.items.find((item) => item.sku === "VIE-001");
    expect(croissant).toBeDefined();
    expect(croissant !== undefined && "operation" in croissant).toBe(false);
  });

  it("ouverte puis close : la carte suit l'horloge", () => {
    const open = shopCatalogueOf(SELLABLE, sale(new Date("2026-12-01T00:00:00.000Z")));
    expect(open.items.find((item) => item.sku === "PAT-002")?.operation?.state).toBe("open");
    const closed = shopCatalogueOf(SELLABLE, sale(ORDER_UNTIL));
    expect(closed.items.find((item) => item.sku === "PAT-002")?.operation?.state).toBe("closed");
    expect(closed.operations[0]?.state).toBe("closed");
  });

  it("une opération réservée aux professionnels n'existe pas pour la vitrine publique", () => {
    const view = shopCatalogueOf(
      SELLABLE,
      sale(new Date("2026-12-01T00:00:00.000Z"), { operations: [noel({ audience: "pro" })] }),
    );

    expect(view.items.map((item) => item.sku)).toEqual(["VIE-001"]);
    expect(view.operations).toEqual([]);
  });

  it("une opération dont aucun article n'est en rayon n'ouvre pas de rayon vide", () => {
    const view = shopCatalogueOf(
      SELLABLE,
      sale(new Date("2026-12-01T00:00:00.000Z"), { operations: [noel({ skus: ["HORS-1"] })] }),
    );

    expect(view.operations).toEqual([]);
  });
});

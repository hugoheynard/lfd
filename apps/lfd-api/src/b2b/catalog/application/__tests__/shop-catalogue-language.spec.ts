import type { ShopSale } from "../shop-catalogue-operations.js";
import { inShopLanguage, shopCatalogueOf } from "../shop-catalogue-view.js";
import { catalogItem } from "./sale-operations-doubles.js";

/**
 * La vitrine dans une langue, et l'audience de ses articles (lot des langues,
 * 2026-10-18 — `documentation/webhooks/vitrine.md` §4 décisions 5
 * et 7, §5). Aucune date n'est comparée : la vente ne porte pas d'opération.
 */

const NOW = new Date(0);

const SALE: ShopSale = {
  operations: [],
  operationOnlySkus: new Set(),
  audience: "public",
  now: NOW,
};

const CROISSANT = catalogItem("VIE-001", {
  name: "Croissant",
  note: "Tourage patient",
  categoryId: "fam-vien",
  categoryName: "Viennoiseries",
  translations: {
    name: { en: "Butter croissant" },
    note: { it: "Sfogliatura paziente" },
    categoryName: { en: "Pastries" },
  },
});

const PAIN = catalogItem("PAI-001", {
  name: "Pain de campagne",
  categoryId: "fam-pains",
  categoryName: "Pains",
  audience: "public",
});

const SELLABLE = [CROISSANT, PAIN];

function view(language: "fr" | "en" | "it") {
  return inShopLanguage(shopCatalogueOf(SELLABLE, SALE), SELLABLE, language);
}

describe("inShopLanguage", () => {
  it("traduit le nom, la ligne et le rayon que le référentiel a traduits", () => {
    const english = view("en");

    expect(english.items[0]).toMatchObject({ name: "Butter croissant", note: "Tourage patient" });
    expect(english.shelves.map((shelf) => shelf.name)).toEqual(["Pastries", "Pains"]);
  });

  it("retombe sur le français, texte par texte, pour ce qui n'est pas traduit", () => {
    const italian = view("it");

    expect(italian.items[0]).toMatchObject({ name: "Croissant", note: "Sfogliatura paziente" });
    expect(italian.items[1]).toMatchObject({ name: "Pain de campagne", note: null });
    expect(italian.shelves.map((shelf) => shelf.name)).toEqual(["Viennoiseries", "Pains"]);
  });

  it("rend la vue française telle quelle", () => {
    const french = shopCatalogueOf(SELLABLE, SALE);

    expect(inShopLanguage(french, SELLABLE, "fr")).toBe(french);
  });

  it("ne touche ni le prix, ni le rangement, ni les clés", () => {
    const french = shopCatalogueOf(SELLABLE, SALE);
    const english = view("en");

    expect(english.items.map((item) => [item.sku, item.unitPriceMillicents, item.shelfId])).toEqual(
      french.items.map((item) => [item.sku, item.unitPriceMillicents, item.shelfId]),
    );
    expect(Object.keys(english.items[0] ?? {}).sort()).toEqual(
      Object.keys(french.items[0] ?? {}).sort(),
    );
  });
});

describe("shopCatalogueOf — l'audience", () => {
  it("porte à qui l'article se vend, tel que le référentiel le dit", () => {
    const items = shopCatalogueOf(SELLABLE, SALE).items;

    expect(items.map((item) => [item.sku, item.audience])).toEqual([
      ["VIE-001", "both"],
      ["PAI-001", "public"],
    ]);
  });
});

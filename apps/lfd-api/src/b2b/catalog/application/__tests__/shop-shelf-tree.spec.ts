import type { CatalogFamilyAncestor } from "../../domain/catalog-family.js";
import { NO_TRANSLATIONS } from "../../domain/catalog-translations.js";
import type { ResolvedCatalogItem } from "../../domain/ports/catalog.reader.js";
import type { ShopSale } from "../shop-catalogue-operations.js";
import { inShopLanguage, shopCatalogueOf } from "../shop-catalogue-view.js";
import { catalogItem } from "./sale-operations-doubles.js";

/**
 * Les rayons en arbre (filtre « Plonger », 2026-10-29) : la vitrine sert les
 * parentes de ses familles peuplées, avec `parentId`, et un catalogue plat
 * reste servi comme avant l'imbrication.
 */

const SALE: ShopSale = {
  operations: [],
  operationOnlySkus: new Set(),
  audience: "public",
  now: new Date(0),
};

const PATISSERIES: CatalogFamilyAncestor = {
  id: "pat",
  name: "Pâtisseries",
  position: 2,
  nameTranslations: { en: "Pastries" },
};
const ENTREMETS: CatalogFamilyAncestor = {
  id: "pat-ent",
  name: "Entremets",
  position: 3,
  nameTranslations: NO_TRANSLATIONS,
};

function inFamily(
  sku: string,
  id: string,
  name: string,
  position: number,
  ancestors: readonly CatalogFamilyAncestor[],
): ResolvedCatalogItem {
  return catalogItem(sku, {
    categoryId: id,
    categoryName: name,
    family: {
      id,
      name,
      position,
      slug: id,
      path: [id, ...ancestors.map((ancestor) => ancestor.id)],
      ...(ancestors.length === 0 ? {} : { ancestors }),
    },
  });
}

const VIEN = inFamily("VIE-001", "vien", "Viennoiseries", 1, []);
const TARTE = inFamily("PAT-001", "pat-tar", "Tartes", 1, [PATISSERIES]);
const HUIT = inFamily("PAT-002", "pat-ent-8", "8 parts", 0, [ENTREMETS, PATISSERIES]);

describe("shopCatalogueOf — les rayons en arbre", () => {
  it("sert les parentes sans article, chacune avant ses filles, avec leur parentId", () => {
    const view = shopCatalogueOf([VIEN, HUIT, TARTE], SALE);

    expect(view.shelves).toEqual([
      { id: "vien", name: "Viennoiseries", position: 0, parentId: null },
      { id: "pat", name: "Pâtisseries", position: 1, parentId: null },
      { id: "pat-tar", name: "Tartes", position: 2, parentId: "pat" },
      { id: "pat-ent", name: "Entremets", position: 3, parentId: "pat" },
      { id: "pat-ent-8", name: "8 parts", position: 4, parentId: "pat-ent" },
    ]);
  });

  it("n'ouvre pas de branche vide : une parente n'entre que par une fille peuplée", () => {
    const view = shopCatalogueOf([VIEN, TARTE], SALE);

    expect(view.shelves.map((shelf) => shelf.id)).toEqual(["vien", "pat", "pat-tar"]);
  });

  it("un catalogue plat reste servi sans parentId, dans l'ordre d'avant", () => {
    const view = shopCatalogueOf([VIEN, catalogItem("PAT-009")], SALE);

    expect(view.shelves).toEqual([
      { id: "vien", name: "Viennoiseries", position: 0 },
      { id: "fam-patisseries", name: "Pâtisseries", position: 1 },
    ]);
  });

  it("traduit aussi le nom d'une parente qui n'a pas d'article à elle", () => {
    const sellable = [VIEN, TARTE];
    const view = inShopLanguage(shopCatalogueOf(sellable, SALE), sellable, "en");

    expect(view.shelves.find((shelf) => shelf.id === "pat")?.name).toBe("Pastries");
  });
});

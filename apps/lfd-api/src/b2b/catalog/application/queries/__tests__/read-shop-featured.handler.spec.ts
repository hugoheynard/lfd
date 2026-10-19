import type { ResolvedCatalogItem, ShopAudience } from "../../../domain/ports/catalog.reader.js";
import { CatalogReader } from "../../../domain/ports/catalog.reader.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { catalogItem, InMemoryCatalogOperations } from "../../__tests__/sale-operations-doubles.js";
import { ReadShopFeaturedHandler } from "../read-shop-featured.handler.js";
import { ReadShopFeaturedQuery } from "../read-shop-featured.query.js";

/**
 * Les incontournables pros sans jeton (2026-10-19). Aucune date n'est comparée
 * à l'horloge : la vente ne porte pas d'opération.
 */

/** Le lecteur : rend ce qui est vendable à l'audience demandée, et la note. */
class SellableCatalog extends CatalogReader {
  readonly audiences: ShopAudience[] = [];

  constructor(
    private readonly byAudience: Readonly<Record<ShopAudience, readonly ResolvedCatalogItem[]>>,
  ) {
    super();
  }

  listSellable(audience: ShopAudience): Promise<ResolvedCatalogItem[]> {
    this.audiences.push(audience);
    return Promise.resolve([...this.byAudience[audience]]);
  }

  findSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  findDefaultByProductSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  listDefaultsByProductSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.reject(new Error("lecture inattendue"));
  }
}

const BAGUETTE = catalogItem("PAI-001", {
  name: "Baguette",
  isFeatured: true,
  categoryId: "fam-pains",
});
const CROISSANT = catalogItem("VIE-001", {
  name: "Croissant",
  isFeatured: true,
  translations: {
    name: { en: "Butter croissant" },
    note: {},
    categoryName: {},
  },
});
const ECLAIR = catalogItem("PAT-001", { name: "Éclair", isFeatured: false });
const CARTON = catalogItem("VIE-001", { sku: "VIE-001-2", isDefault: false, isFeatured: true });

function handlerOver(catalog: SellableCatalog, operations = new InMemoryCatalogOperations()) {
  return new ReadShopFeaturedHandler(catalog, operations, new FixedClock(new Date(0)));
}

describe("ReadShopFeaturedHandler", () => {
  it("lit la vitrine PRO et ne garde que ses mises en avant, dans l'ordre du rayon", async () => {
    const catalog = new SellableCatalog({
      pro: [BAGUETTE, ECLAIR, CROISSANT, CARTON],
      public: [ECLAIR],
    });

    const view = await handlerOver(catalog).execute(new ReadShopFeaturedQuery("pro", "fr"));

    expect(catalog.audiences).toEqual(["pro"]);
    expect(view.map((item) => item.sku)).toEqual(["PAI-001", "VIE-001"]);
  });

  it("ne sort pas un article que la vitrine pro écarte (vendu seulement pendant une opération)", async () => {
    const catalog = new SellableCatalog({ pro: [BAGUETTE, CROISSANT], public: [] });
    const operations = new InMemoryCatalogOperations([], ["PAI-001-1"]);

    const view = await handlerOver(catalog, operations).execute(
      new ReadShopFeaturedQuery("pro", "fr"),
    );

    expect(view.map((item) => item.sku)).toEqual(["VIE-001"]);
  });

  it("traduit le nom dans la langue demandée", async () => {
    const catalog = new SellableCatalog({ pro: [CROISSANT], public: [] });

    const view = await handlerOver(catalog).execute(new ReadShopFeaturedQuery("pro", "en"));

    expect(view[0]?.name).toBe("Butter croissant");
  });

  it("ne porte aucun prix — seulement la forme annoncée", async () => {
    const catalog = new SellableCatalog({ pro: [BAGUETTE], public: [] });

    const view = await handlerOver(catalog).execute(new ReadShopFeaturedQuery("pro", "fr"));

    expect(Object.keys(view[0] ?? {}).sort()).toEqual([
      "image",
      "name",
      "note",
      "shelfId",
      "sku",
      "thumbnail",
    ]);
  });
});

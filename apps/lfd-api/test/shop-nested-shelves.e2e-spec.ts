/**
 * E2E des **rayons en arbre** de la boutique — `GET /shop/catalogue`.
 *
 * Pourquoi : le filtre « Plonger » (2026-10-29) range les rayons selon
 * l'imbrication des familles du référentiel. Ce que seul ce niveau prouve :
 * le `parent_id` reçu par les faits arrive jusqu'à la vue, une parente sans
 * article à elle y est nommée depuis le vrai miroir, et un catalogue plat
 * reste servi sans `parentId`.
 */
import type { ShopCatalogueView } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

type Category = CatalogSnapshot["categories"][number];

function family(id: string, name: string, position: number, parentId: string | null): Category {
  return { id, name, slug: id, parentId, position, vatRatePercent: 5.5 };
}

function product(id: string, sku: string, categoryId: string): CatalogSnapshot["products"][number] {
  return {
    id,
    sku,
    name: sku,
    categoryId,
    kind: "daily",
    variants: [
      {
        id: `${id}_v`,
        sku: `${sku}-1`,
        name: sku,
        priceMillicents: millicentsFromCents(200),
        weightGrams: null,
        isDefault: true,
        position: 0,
        vatRatePercent: 5.5,
        publicTtcCents: 250,
        proPricePerKgMillicents: null,
        publicPricePerKgTtcCents: null,
        saleUnit: "piece",
        weightMinGrams: null,
        weightStepGrams: null,
        minQuantities: { pro: null, public: null },
        publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
        allergens: null,
        allergenLabels: null,
        mayContain: null,
        allergensPrecautionary: false,
        allergenTexts: null,
      },
    ],
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
    requiresCold: false,
    variantsAsTiles: true,
  };
}

/** `generatedAt` n'est comparé à aucune horloge : c'est une étiquette de push. */
function snapshot(categories: Category[], products: CatalogSnapshot["products"]): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-08-17T08:00:00.000Z",
    categories,
    products,
    orderTimeLimits: [],
    operations: [],
  };
}

async function shelves(): Promise<ShopCatalogueView["shelves"]> {
  const view = jsonBody<ShopCatalogueView>(await ctx.http().get("/shop/catalogue").expect(200));
  return view.shelves;
}

describe("GET /shop/catalogue — les rayons en arbre", () => {
  it("sert la parente sans article avant sa fille, avec parentId", async () => {
    await deliverAsFacts(
      ctx,
      snapshot(
        [
          family("fam-vien", "Viennoiseries", 0, null),
          family("fam-pat", "Pâtisseries", 1, null),
          family("fam-pat-ent", "Entremets", 0, "fam-pat"),
        ],
        [product("prd_1", "VIE-001", "fam-vien"), product("prd_2", "PAT-001", "fam-pat-ent")],
      ),
    );

    expect(await shelves()).toEqual([
      { id: "fam-vien", name: "Viennoiseries", position: 0, parentId: null },
      { id: "fam-pat", name: "Pâtisseries", position: 1, parentId: null },
      { id: "fam-pat-ent", name: "Entremets", position: 2, parentId: "fam-pat" },
    ]);
  });

  it("un catalogue plat reste servi comme avant, sans parentId", async () => {
    await deliverAsFacts(
      ctx,
      snapshot(
        [family("fam-vien", "Viennoiseries", 0, null), family("fam-pat", "Pâtisseries", 1, null)],
        [product("prd_1", "VIE-001", "fam-vien"), product("prd_2", "PAT-001", "fam-pat")],
      ),
    );

    expect(await shelves()).toEqual([
      { id: "fam-vien", name: "Viennoiseries", position: 0 },
      { id: "fam-pat", name: "Pâtisseries", position: 1 },
    ]);
  });
});

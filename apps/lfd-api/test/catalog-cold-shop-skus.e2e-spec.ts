/**
 * E2E — **le froid relayé à la livraison, par SKU de vente et toutes
 * audiences** (L0 de `documentation/catalogue/plan-pro-voit-les-declinaisons.md`).
 *
 * Régression (vitruve, 2026-10-29) : le miroir rendait le froid par SKU
 * PRODUIT, et le colisage comme la feuille d'arrêt le comparaient au SKU de la
 * LIGNE. Une ligne vendue sous une déclinaison non défaut (`P-X-2`) partait
 * donc en tournée marquée sèche ; une déclinaison vendue au public seulement
 * restait inconnue de la feuille d'arrêt. Contre le vrai SQL du miroir, livré
 * par les faits du référentiel.
 */
import {
  CATALOG_SNAPSHOT_VERSION,
  type CatalogSnapshot,
  type SyncProduct,
} from "@lfd/catalog-sync";

import { DeliveryColdSkusReader } from "../src/delivery/channels/commerce/index.js";
import { packingLinesOf } from "../src/delivery/application/packing-lines.js";
import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";

const FAMILY = "fam-froid";
const COLD_PRODUCT = "FRD";
const DRY_PRODUCT = "SEC";

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

type Variant = SyncProduct["variants"][number];

/** Une déclinaison ; `priceMillicents: null` = pas servie aux pros (public seul). */
function variant(sku: string, position: number, priceMillicents: number | null): Variant {
  return {
    id: `var_${sku}`,
    sku,
    name: `Article ${sku}`,
    priceMillicents,
    weightGrams: null,
    isDefault: position === 0,
    position,
    vatRatePercent: 5.5,
    publicTtcCents: 450,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    minQuantities: { pro: null, public: null },
    publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 426_540 } },
    allergens: ["UW"],
    allergenLabels: null,
    mayContain: null,
    allergensPrecautionary: false,
    allergenTexts: null,
  };
}

function product(sku: string, requiresCold: boolean, variants: readonly Variant[]): SyncProduct {
  return {
    id: `prd_${sku}`,
    sku,
    name: `Fiche ${sku}`,
    categoryId: FAMILY,
    kind: "daily",
    variants: [...variants],
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
    requiresCold,
    variantsAsTiles: true,
  };
}

/** Une fiche froide à trois déclinaisons (la troisième au public seul), une sèche. */
function catalogue(): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: daysAgo(1),
    categories: [
      {
        id: FAMILY,
        name: "Froid",
        slug: "froid",
        parentId: null,
        position: 0,
        vatRatePercent: 5.5,
      },
    ],
    products: [
      product(COLD_PRODUCT, true, [
        variant(`${COLD_PRODUCT}-1`, 0, 300_000),
        variant(`${COLD_PRODUCT}-2`, 1, 320_000),
        variant(`${COLD_PRODUCT}-3`, 2, null),
      ]),
      product(DRY_PRODUCT, false, [variant(`${DRY_PRODUCT}-1`, 0, 200_000)]),
    ],
    orderTimeLimits: [],
    operations: [],
  };
}

async function coldSkus(): Promise<ReadonlySet<string>> {
  await deliverAsFacts(ctx, catalogue());
  return ctx.app.get(DeliveryColdSkusReader).coldSkus();
}

/** Une ligne de commande vendue sous ce SKU. */
const lineOf = (sku: string) => ({ sku, name: sku, quantity: 1, saleUnit: "piece" as const });

describe("DeliveryColdSkusReader — le froid par SKU de vente", () => {
  // Régression : la ligne `P-X-2` partait `requiresCold: false` (vitruve, 2026-10-29).
  it("une ligne P-X-2 froide part marquée froide en tournée", async () => {
    const lines = packingLinesOf([lineOf(`${COLD_PRODUCT}-2`)], await coldSkus());

    expect(lines.map((line) => line.requiresCold)).toEqual([true]);
  });

  it("une déclinaison vendue au public seulement est connue froide", async () => {
    expect((await coldSkus()).has(`${COLD_PRODUCT}-3`)).toBe(true);
  });

  it("le défaut reste froid sous le SKU de son produit, et le sec reste sec", async () => {
    const cold = await coldSkus();

    expect(cold.has(COLD_PRODUCT)).toBe(true);
    // Le défaut se vend sous le SKU produit (`shopSkuOf`) : pas sous le sien.
    expect(cold.has(`${COLD_PRODUCT}-1`)).toBe(false);
    expect(cold.has(DRY_PRODUCT)).toBe(false);
  });
});

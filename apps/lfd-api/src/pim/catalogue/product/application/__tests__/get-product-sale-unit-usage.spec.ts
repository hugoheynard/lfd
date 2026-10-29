import {
  FailingSaleReferenceUsage,
  FixedSaleReferenceUsage,
} from "../../../../channels/b2b-platform/sale-reference-usage/__tests__/sale-reference-usage-doubles.js";
import {
  GetProductSaleUnitUsageHandler,
  GetProductSaleUnitUsageQuery,
} from "../get-product-sale-unit-usage.js";
import {
  OneProduct,
  PRODUCT_ID,
  SELLABLE_VARIANT,
  bareVariant,
  tarte,
} from "./audience-doubles.js";

/** Ce que la carte « Tarif » montre avant qu'on essaie (`plan-changer-l-unite-de-vente.md`, § 8). */

const SECOND = bareVariant({ id: "prd_tarte_v2", sku: "PAT-7-2", isDefault: false, position: 1 });

describe("GetProductSaleUnitUsageHandler", () => {
  it("interroge le commerce en UN lot pour toutes les déclinaisons, et dit où chacune a servi", async () => {
    const usage = new FixedSaleReferenceUsage({ "PAT-7-1": ["mercuriale", "order"] });
    const handler = new GetProductSaleUnitUsageHandler(
      new OneProduct(tarte({ variants: [SELLABLE_VARIANT, SECOND] })),
      usage,
    );

    const view = await handler.execute(new GetProductSaleUnitUsageQuery(PRODUCT_ID));

    expect(usage.asked).toHaveLength(1);
    expect(view.variants).toEqual([
      {
        variantId: "prd_tarte_v1",
        verified: true,
        uses: ["order", "mercuriale"],
        labels: ["déjà commandée", "porte une mercuriale"],
      },
      { variantId: "prd_tarte_v2", verified: true, uses: [], labels: [] },
    ]);
  });

  it("une panne du commerce rend « non vérifié », jamais « libre »", async () => {
    const handler = new GetProductSaleUnitUsageHandler(
      new OneProduct(tarte()),
      new FailingSaleReferenceUsage(),
    );

    const view = await handler.execute(new GetProductSaleUnitUsageQuery(PRODUCT_ID));

    expect(view.variants).toEqual([
      { variantId: "prd_tarte_v1", verified: false, uses: [], labels: [] },
    ]);
  });
});

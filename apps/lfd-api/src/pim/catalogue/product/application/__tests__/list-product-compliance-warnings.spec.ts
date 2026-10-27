import { FixedActiveContexts } from "../../../../sales-contexts/domain/ports/__tests__/fixed-active-contexts.js";
import type { ProductSnapshot } from "../../domain/entities/product.js";
import { FixedCitedAllergens } from "../../domain/ports/__tests__/fixed-cited-allergens.js";
import { ListProductComplianceWarningsHandler } from "../list-product-compliance-warnings.js";
import {
  BOTH_RATES,
  FixedVatPercents,
  OneProduct,
  PRODUCT_ID,
  SELLABLE_VARIANT,
  bareVariant,
  tarte,
} from "./audience-doubles.js";

function listing(
  product: ProductSnapshot,
  cited: FixedCitedAllergens = new FixedCitedAllergens(),
): ListProductComplianceWarningsHandler {
  return new ListProductComplianceWarningsHandler(
    new OneProduct(product),
    new FixedVatPercents(BOTH_RATES),
    new FixedActiveContexts(["b2b", "takeaway"]),
    cited,
  );
}

const EMPTY_SHEET = { declared: [], mayContain: [] };

describe("ListProductComplianceWarningsHandler — le jugement unique, sur la table", () => {
  it("ne rend rien pour une fiche sans constat", async () => {
    expect(await listing(tarte()).execute()).toEqual([]);
  });

  // Une publiée n'est pas épargnée : elle a pu perdre un taux depuis.
  it("signale une déclinaison incomplète même si une autre suffit à activer", async () => {
    const product = tarte({
      status: "published",
      variants: [
        SELLABLE_VARIANT,
        bareVariant({ id: "var_2", sku: "PAT-7-2", isDefault: false, position: 1 }),
      ],
    });

    expect(await listing(product).execute()).toEqual([
      {
        productId: PRODUCT_ID,
        warnings: [
          {
            code: "variant_incomplete",
            severity: "warning",
            variantId: "var_2",
            sku: "PAT-7-2",
            missing: ["price", "allergens", "pro_price"],
          },
        ],
      },
    ]);
  });

  it("signale « aucun allergène » contredit par la composition, en bloquant", async () => {
    const product = tarte({
      variants: [
        bareVariant({
          priceCents: 3_200,
          proPriceMillicents: 2_730_331,
          allergenSheet: EMPTY_SHEET,
        }),
      ],
    });
    const cited = new FixedCitedAllergens(new Map([[PRODUCT_ID, ["gluten"]]]));

    const [view] = await listing(product, cited).execute();

    expect(view?.warnings).toEqual([
      expect.objectContaining({
        code: "allergens_contradict_none",
        severity: "blocking",
        allergenCodes: ["gluten"],
      }),
    ]);
  });

  it("ignore une fiche archivée, et lit les citations en un seul lot", async () => {
    const cited = new FixedCitedAllergens(new Map([[PRODUCT_ID, ["milk"]]]));

    expect(await listing(tarte({ status: "archived" }), cited).execute()).toEqual([]);
    expect(cited.requests).toEqual([[]]);
  });
});

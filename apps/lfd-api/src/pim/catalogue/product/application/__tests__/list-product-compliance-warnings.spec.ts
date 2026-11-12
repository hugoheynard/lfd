import { FixedActiveContexts } from "../../../../sales-contexts/domain/ports/__tests__/fixed-active-contexts.js";
import type { ProductSnapshot } from "../../domain/entities/product.js";
import { FixedCitedAllergens } from "../../domain/ports/__tests__/fixed-cited-allergens.js";
import {
  ListProductComplianceWarningsHandler,
  ListProductComplianceWarningsQuery,
} from "../list-product-compliance-warnings.js";
import { ProductNotFoundError } from "../../domain/errors/product-errors.js";
import {
  BOTH_RATES,
  FixedVatPercents,
  OneProduct,
  PRODUCT_ID,
  OneCategory,
  SELLABLE_VARIANT,
  bareVariant,
  family,
  tarte,
} from "./audience-doubles.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";

function listing(
  product: ProductSnapshot,
  cited: FixedCitedAllergens = new FixedCitedAllergens(),
  audience: Audience = "both",
): ListProductComplianceWarningsHandler {
  return new ListProductComplianceWarningsHandler(
    new OneProduct(product),
    new FixedVatPercents(BOTH_RATES),
    new FixedActiveContexts(["b2b", "takeaway"]),
    cited,
    new OneCategory(family(audience)),
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
            missing: ["price", "pro_price"],
          },
          {
            code: "allergens_precautionary",
            severity: "warning",
            variantId: "var_2",
            sku: "PAT-7-2",
          },
        ],
      },
    ]);
  });

  /**
   * Régression : le matin du 2026-10-27, « aucun allergène » contredit par la
   * composition était un constat BLOQUANT ; la composition corrige désormais
   * l'état servi, sans constat (`plan-allergenes-jamais-bloquants.md`).
   */
  it("ne signale plus « aucun allergène » contredit par la composition", async () => {
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

    expect(await listing(product, cited).execute()).toEqual([]);
  });

  it("ignore une fiche archivée, et lit les citations en un seul lot", async () => {
    const cited = new FixedCitedAllergens(new Map([[PRODUCT_ID, ["milk"]]]));

    expect(await listing(tarte({ status: "archived" }), cited).execute()).toEqual([]);
    expect(cited.requests).toEqual([[]]);
  });

  /** `saisir-un-prix.md` (2026-10-27) : la table le dit. */
  it("signale le prix pro manquant d'une fiche « les deux », sans la bloquer", async () => {
    const product = tarte({
      variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: null }],
    });

    expect(await listing(product).execute()).toEqual([
      {
        productId: PRODUCT_ID,
        warnings: [
          {
            code: "price_missing_for_audience",
            severity: "warning",
            variantId: SELLABLE_VARIANT.id,
            sku: SELLABLE_VARIANT.sku,
            audience: "pro",
          },
        ],
      },
    ]);
  });

  it("lit l'audience de la famille : une fiche « public » n'exige pas le prix pro", async () => {
    const product = tarte({
      variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: null }],
    });

    expect(await listing(product, new FixedCitedAllergens(), "public").execute()).toEqual([]);
  });
});

describe("ListProductComplianceWarningsHandler — une seule fiche (`?productId=`)", () => {
  const withoutProPrice = () =>
    tarte({ variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: null }] });

  it("rend les constats de cette fiche, jugés comme pour la table", async () => {
    const handler = listing(withoutProPrice());

    expect(await handler.execute(new ListProductComplianceWarningsQuery(PRODUCT_ID))).toEqual(
      await handler.execute(new ListProductComplianceWarningsQuery()),
    );
  });

  it("ne rend rien pour une fiche archivée, sans rien lire de plus", async () => {
    const cited = new FixedCitedAllergens();

    expect(
      await listing(tarte({ status: "archived" }), cited).execute(
        new ListProductComplianceWarningsQuery(PRODUCT_ID),
      ),
    ).toEqual([]);
    expect(cited.requests).toEqual([]);
  });

  it("refuse une fiche inconnue plutôt que de la dire conforme", async () => {
    await expect(
      listing(tarte()).execute(new ListProductComplianceWarningsQuery("prd_inconnu")),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("lit les citations de cette fiche seulement", async () => {
    const cited = new FixedCitedAllergens();

    await listing(tarte(), cited).execute(new ListProductComplianceWarningsQuery(PRODUCT_ID));

    expect(cited.requests).toEqual([[PRODUCT_ID]]);
  });
});

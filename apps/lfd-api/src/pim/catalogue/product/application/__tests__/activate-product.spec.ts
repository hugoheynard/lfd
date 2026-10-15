import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import {
  ProductNotActivatableError,
  ProductNotFoundError,
  ProductNotPublishableError,
} from "../../domain/errors/product-errors.js";
import type { ProductSnapshot } from "../../domain/entities/product.js";
import { ActivateProductCommand, ActivateProductHandler } from "../activate-product.js";
import {
  BOTH_RATES,
  FixedVatPercents,
  OneCategory,
  OneProduct,
  PRODUCT_ID,
  SELLABLE_VARIANT,
  bareVariant,
  family,
  tarte,
} from "./audience-doubles.js";

/**
 * **Activer** — l'ancien « publier » (1e du plan
 * `plan-catalogue-synchronise-par-audience.md`). Le handler montre à
 * l'agrégat ce qu'il ne voit pas — taux résolus, audience de la famille — et
 * l'agrégat tranche.
 */

interface Setup {
  readonly product?: ProductSnapshot | null;
  readonly familyAudience?: Audience;
  readonly percents?: CategoryVatPercents;
  readonly journal?: RecordingJournal;
}

function activating(products: OneProduct, setup: Setup = {}): Promise<void> {
  return new ActivateProductHandler(
    products,
    new OneCategory(family(setup.familyAudience ?? "both")),
    new FixedVatPercents(setup.percents ?? BOTH_RATES),
    setup.journal ?? new RecordingJournal(),
    new DirectUnitOfWork(),
  ).execute(new ActivateProductCommand(PRODUCT_ID));
}

/** Sept valeurs de l'annexe XV plus l'indice : seule l'énergie est saisie. */
const ENERGY_ONLY = {
  energyKcal: 410,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
  glycemicIndex: null,
} as const;

describe("ActivateProductHandler — ce qui est vendable s'active", () => {
  it("active une fiche tarifée, étiquetée, taxée pour ses deux clientèles", async () => {
    const products = new OneProduct(tarte());
    const journal = new RecordingJournal();

    await activating(products, { journal });

    expect(products.stored?.status).toBe("published");
    // La valeur de journal reste `product.published` : elle ne se renomme pas.
    expect(journal.types()).toEqual(["product.published"]);
  });

  it("une seconde activation ne bouge rien et n'écrit rien", async () => {
    const products = new OneProduct(tarte({ status: "published" }));
    const journal = new RecordingJournal();

    await activating(products, { journal });

    expect(journal.types()).toEqual([]);
  });

  it("jette si la fiche n'existe pas", async () => {
    await expect(activating(new OneProduct(null))).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe("ActivateProductHandler — le prix et le taux", () => {
  it("refuse une fiche dont aucune déclinaison n'a de prix, en nommant la déclinaison", async () => {
    const products = new OneProduct(
      tarte({ variants: [bareVariant({ allergenSheet: { declared: [], mayContain: [] } })] }),
    );

    await expect(activating(products)).rejects.toBeInstanceOf(ProductNotActivatableError);
    await expect(activating(products)).rejects.toThrow("PAT-7-1");
    expect(products.stored?.status).toBe("draft");
  });

  it("refuse une fiche vendue aux pros sans taux « b2b »", async () => {
    const products = new OneProduct(tarte());

    await expect(
      activating(products, { familyAudience: "pro", percents: { takeaway: 5.5 } }),
    ).rejects.toThrow(/« b2b ».*professionnels/);
    expect(products.stored?.status).toBe("draft");
  });

  it("refuse une fiche vendue au public sans taux « takeaway »", async () => {
    const products = new OneProduct(tarte());

    await expect(
      activating(products, { familyAudience: "public", percents: { b2b: 20 } }),
    ).rejects.toThrow(/« takeaway ».*particuliers/);
  });

  it("n'exige que le taux de la clientèle visée", async () => {
    const products = new OneProduct(tarte());

    await activating(products, { familyAudience: "pro", percents: { b2b: 20 } });

    expect(products.stored?.status).toBe("published");
  });

  it("juge l'audience PROPRE de la fiche avant celle de sa famille", async () => {
    // La famille vend aux pros seuls ; la fiche s'ouvre aussi au public.
    const products = new OneProduct(tarte({ audience: "both" }));

    await expect(
      activating(products, { familyAudience: "pro", percents: { b2b: 20 } }),
    ).rejects.toThrow(/particuliers/);
  });
});

/**
 * 🔴 **L'invariant 7 reste sur les allergènes, déclinaison par déclinaison**,
 * jusqu'au lot 2 — repris de la suite d'avant (`plan-separer-allergenes-et-
 * nutrition.md`, D2, D3) : ce qui décide d'un `409` est la moitié
 * allergènes de la fiche, jamais la moitié valeurs.
 */
describe("ActivateProductHandler — les allergènes", () => {
  function withVariant(over: Partial<ProductSnapshot["variants"][number]>): OneProduct {
    return new OneProduct(tarte({ variants: [{ ...SELLABLE_VARIANT, ...over }] }));
  }

  it("active des allergènes déclarés sans la moindre valeur nutritionnelle", async () => {
    const products = withVariant({ allergenSheet: { declared: ["UW"], mayContain: [] } });

    await activating(products);

    expect(products.stored?.status).toBe("published");
  });

  it("refuse des valeurs nutritionnelles sans déclaration d'allergène, en nommant la référence", async () => {
    const products = withVariant({ allergenSheet: null, nutrition: ENERGY_ONLY });

    await expect(activating(products)).rejects.toBeInstanceOf(ProductNotPublishableError);
    await expect(activating(products)).rejects.toThrow("PAT-7-1");
    await expect(activating(products)).rejects.toThrow(/Allergènes/);
    expect(products.stored?.status).toBe("draft");
  });

  /**
   * Le lot 1 n'assouplit PAS : une déclinaison tarifée et étiquetée ne
   * couvre pas sa sœur sans déclaration — la projection d'aujourd'hui ne
   * l'écarterait pas.
   */
  it("refuse encore si UNE déclinaison active n'a pas d'allergènes, même si une autre est complète", async () => {
    const products = new OneProduct(
      tarte({
        variants: [
          SELLABLE_VARIANT,
          bareVariant({ id: "prd_tarte_v2", sku: "PAT-7-2", isDefault: false, position: 1 }),
        ],
      }),
    );

    await expect(activating(products)).rejects.toThrow("PAT-7-2");
  });
});

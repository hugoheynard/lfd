import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import {
  ProductAllergenContradictionError,
  ProductNotActivatableError,
  ProductNotFoundError,
} from "../../domain/errors/product-errors.js";
import type { ProductSnapshot } from "../../domain/entities/product.js";
import { ActivateProductCommand, ActivateProductHandler } from "../activate-product.js";
import {
  BOTH_RATES,
  FixedVatPercents,
  OneProduct,
  PRODUCT_ID,
  SELLABLE_VARIANT,
  bareVariant,
  tarte,
} from "./audience-doubles.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { FixedAccountingRules } from "../../../../accounting-rules/domain/ports/__tests__/fixed-accounting-rules.js";
import { FixedCitedAllergens } from "../../domain/ports/__tests__/fixed-cited-allergens.js";
import { FixedActiveContexts } from "../../../../sales-contexts/domain/ports/__tests__/fixed-active-contexts.js";

/**
 * **Activer** — l'ancien « publier » (1e du plan
 * `plan-catalogue-synchronise-par-audience.md`). Le handler montre à
 * l'agrégat ce qu'il ne voit pas — taux résolus, contextes en service, règle
 * du prix pro — et l'agrégat tranche (lot 2b : au moins une déclinaison
 * complète).
 */

interface Setup {
  readonly product?: ProductSnapshot | null;
  readonly contexts?: readonly string[];
  readonly percents?: CategoryVatPercents;
  readonly journal?: RecordingJournal;
  readonly accounting?: FixedAccountingRules;
  readonly cited?: ReadonlyMap<string, readonly string[]>;
}

function activating(products: OneProduct, setup: Setup = {}): Promise<void> {
  return new ActivateProductHandler(
    products,
    new FixedVatPercents(setup.percents ?? BOTH_RATES),
    setup.journal ?? new RecordingJournal(),
    new DirectUnitOfWork(),
    new RecordingCatalogEmitter(),
    setup.accounting ?? FixedAccountingRules.with("ratio_ttc", 9_000),
    new FixedActiveContexts(setup.contexts ?? ["b2b", "takeaway"]),
    new FixedCitedAllergens(setup.cited),
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

  /** La règle tranchée par Hugo : un taux pour chaque contexte EN SERVICE (lot 2b). */
  it("refuse sans le taux d'un contexte en service, en le nommant", async () => {
    const products = new OneProduct(tarte({ audience: "pro" }));

    await expect(activating(products, { contexts: ["b2b", "takeaway", "eatIn"] })).rejects.toThrow(
      /« eatIn »/,
    );
    expect(products.stored?.status).toBe("draft");
  });

  it("refuse sans taux « b2b », quelle que soit l'audience", async () => {
    const products = new OneProduct(tarte({ audience: "public" }));

    await expect(
      activating(products, { percents: { takeaway: 5.5 }, contexts: ["takeaway"] }),
    ).rejects.toThrow(/« b2b »/);
  });

  it("n'exige pas un contexte hors service", async () => {
    const products = new OneProduct(tarte());

    await activating(products, { percents: { b2b: 20 }, contexts: ["b2b"] });

    expect(products.stored?.status).toBe("published");
  });
});

/** Lot P (P4) : sous « Prix saisi », le prix pro HT est exigé pour activer. */
describe("ActivateProductHandler — le prix pro saisi", () => {
  it("refuse sous entered une fiche sans prix pro HT, en le disant", async () => {
    const products = new OneProduct(tarte());

    await expect(
      activating(products, { accounting: FixedAccountingRules.with("entered", 9_000) }),
    ).rejects.toThrow(/PAT-7-1.*prix pro HT/);
    expect(products.stored?.status).toBe("draft");
  });

  it("active sous entered une fiche dont la déclinaison porte les deux prix", async () => {
    const products = new OneProduct(
      tarte({ variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: 2_730_000 }] }),
    );

    await activating(products, { accounting: FixedAccountingRules.with("entered", 9_000) });

    expect(products.stored?.status).toBe("published");
  });

  /**
   * Régression (BLOQUANT `vitruve`, lot S, 2026-10-16) : sans règles
   * comptables, « Activer » refusait (`pro_price_rule`) même une déclinaison
   * qui portait son prix pro saisi. Une base sans règles vaut « prix saisi ».
   */
  it("active sans règles comptables une fiche dont la déclinaison porte son prix pro", async () => {
    const products = new OneProduct(
      tarte({ variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: 2_730_000 }] }),
    );

    await activating(products, { accounting: new FixedAccountingRules(null) });

    expect(products.stored?.status).toBe("published");
  });

  it("refuse sans règles comptables une fiche sans prix pro, en nommant le prix pro", async () => {
    const products = new OneProduct(tarte());

    await expect(
      activating(products, { accounting: new FixedAccountingRules(null) }),
    ).rejects.toThrow(/PAT-7-1.*prix pro HT/);
  });
});

/**
 * 🔴 **L'invariant 7 se juge sur les allergènes, jamais sur les valeurs**
 * (`plan-separer-allergenes-et-nutrition.md`, D2, D3) — et depuis le lot 2b,
 * par déclinaison : une seule complète suffit à activer.
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

    await expect(activating(products)).rejects.toBeInstanceOf(ProductNotActivatableError);
    await expect(activating(products)).rejects.toThrow("PAT-7-1");
    await expect(activating(products)).rejects.toThrow(/Allergènes/);
    expect(products.stored?.status).toBe("draft");
  });

  /**
   * 🔴 Lot 2b (2b3) : une déclinaison tarifée et étiquetée suffit ; sa sœur
   * sans déclaration n'est pas vendue — la projection des faits et l'envoi
   * actuel l'écartent (`variant_sans_allergenes`). Ce cas était refusé
   * jusqu'au lot 2b, quand l'envoi ne l'écartait pas.
   */
  it("active si UNE déclinaison est complète, même si une autre n'a pas d'allergènes", async () => {
    const products = new OneProduct(
      tarte({
        variants: [
          SELLABLE_VARIANT,
          bareVariant({ id: "prd_tarte_v2", sku: "PAT-7-2", isDefault: false, position: 1 }),
        ],
      }),
    );

    await activating(products);

    expect(products.stored?.status).toBe("published");
  });
});

describe("ActivateProductHandler — la composition contredit la déclaration", () => {
  /**
   * Régression : un « pain sans blé » déclaré « aucun allergène » dont la
   * composition cite la farine s'activait (décision de Hugo, 2026-10-27).
   */
  it("refuse le pain sans blé qui déclare « aucun allergène » et cite le gluten", async () => {
    const products = new OneProduct(
      tarte({
        variants: [
          bareVariant({ priceCents: 3_200, allergenSheet: { declared: [], mayContain: [] } }),
        ],
      }),
    );
    const cited = new Map([[PRODUCT_ID, ["gluten"]]]);

    await expect(activating(products, { cited })).rejects.toBeInstanceOf(
      ProductAllergenContradictionError,
    );
    await expect(activating(products, { cited })).rejects.toThrow(
      /PAT-7-1 déclare « aucun allergène ».*gluten.*retirer l'ingrédient/,
    );
    expect(products.stored?.status).toBe("draft");
  });

  it("active quand la déclaration couvre ce que la composition cite", async () => {
    const products = new OneProduct(tarte());

    await activating(products, { cited: new Map([[PRODUCT_ID, ["gluten"]]]) });

    expect(products.stored?.status).toBe("published");
  });
});

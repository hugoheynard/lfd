import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { AccountingRulesNotSetError } from "../../../../accounting-rules/domain/errors/accounting-rules-errors.js";
import { FixedAccountingRules } from "../../../../accounting-rules/domain/ports/__tests__/fixed-accounting-rules.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { VariantSnapshot } from "../../domain/entities/variant.js";
import { ProPricePrefillMismatchError } from "../../domain/errors/product-errors.js";
import { ApplyProPricePrefillHandler } from "../apply-pro-price-prefill.js";
import { PreviewProPricePrefillHandler } from "../preview-pro-price-prefill.js";
import {
  BOTH_RATES,
  FixedVatPercents,
  OneProduct,
  PRODUCT_ID,
  SELLABLE_VARIANT,
  tarte,
} from "./audience-doubles.js";

/**
 * **Le pré-remplissage du prix pro** (lot P, P5) : un aperçu qui rejoue la
 * porte, un `apply` qui n'écrit que là où rien n'est saisi, par l'agrégat.
 */

/** 32,00 € TTC, rapport 90 %, taux b2b 20 % → 28,80 € TTC → 24,00000 € HT. */
const OWN: VariantSnapshot = {
  ...SELLABLE_VARIANT,
  id: "v_own",
  sku: "PAT-7-1",
  priceCents: 3_200,
};
const ALIGNED: VariantSnapshot = {
  ...SELLABLE_VARIANT,
  id: "v_aligned",
  sku: "PAT-7-2",
  isDefault: false,
  pricingFollowsDefault: true,
};
const ENTERED: VariantSnapshot = {
  ...SELLABLE_VARIANT,
  id: "v_entered",
  sku: "PAT-7-3",
  isDefault: false,
  priceCents: 1_000,
  proPriceMillicents: 777_777,
};
const UNPRICED: VariantSnapshot = {
  ...SELLABLE_VARIANT,
  id: "v_unpriced",
  sku: "PAT-7-4",
  isDefault: false,
  priceCents: null,
};

function catalogue(): OneProduct {
  return new OneProduct(tarte({ variants: [OWN, ALIGNED, ENTERED, UNPRICED] }));
}

function preview(
  products: OneProduct,
  accounting = FixedAccountingRules.with("ratio_ttc", 9_000),
  percents: CategoryVatPercents = BOTH_RATES,
) {
  return new PreviewProPricePrefillHandler(
    products,
    new FixedVatPercents(percents),
    accounting,
  ).execute();
}

function apply(
  products: OneProduct,
  accounting = FixedAccountingRules.with("ratio_ttc", 9_000),
  journal = new RecordingJournal(),
  emitter = new RecordingCatalogEmitter(),
) {
  return new ApplyProPricePrefillHandler(
    products,
    new FixedVatPercents(BOTH_RATES),
    accounting,
    journal,
    new DirectUnitOfWork(),
    emitter,
  ).execute();
}

describe("PreviewProPricePrefillHandler — l'aperçu", () => {
  it("rend chaque déclinaison avec son sort, le HT servi et le HT pré-rempli", async () => {
    const view = await preview(catalogue());

    expect(view).toMatchObject({
      method: "ratio_ttc",
      ratioBp: 9_000,
      toPrefill: 1,
      mismatches: 0,
    });
    const bySku = new Map(view.rows.map((row) => [row.sku, row]));
    expect(bySku.get("PAT-7-1")).toMatchObject({
      status: "to_prefill",
      publicTtcCents: 3_200,
      vatPercent: 20,
      servedHtMillicents: 2_400_000,
      prefilledHtMillicents: 2_400_000,
      mismatch: false,
    });
    expect(bySku.get("PAT-7-2")?.status).toBe("aligned");
    expect(bySku.get("PAT-7-3")?.status).toBe("already_entered");
    expect(bySku.get("PAT-7-4")?.status).toBe("no_price");
  });

  it("liste à part une déclinaison sans taux b2b", async () => {
    const view = await preview(catalogue(), undefined, { takeaway: 5.5 });

    expect(view.rows.find((row) => row.sku === "PAT-7-1")?.status).toBe("no_vat_b2b");
    expect(view.toPrefill).toBe(0);
  });

  /** Sous `entered`, le fil sert la saisie — ou rien : un pré-remplissage écrirait autre chose. */
  it("compte un écart quand la méthode n'est plus ratio_ttc", async () => {
    const view = await preview(catalogue(), FixedAccountingRules.with("entered", 9_000));

    expect(view.mismatches).toBe(1);
    expect(view.rows.find((row) => row.sku === "PAT-7-1")).toMatchObject({
      servedHtMillicents: null,
      prefilledHtMillicents: 2_400_000,
      mismatch: true,
    });
  });

  it("refuse tant que rien n'est réglé", async () => {
    await expect(preview(catalogue(), new FixedAccountingRules(null))).rejects.toBeInstanceOf(
      AccountingRulesNotSetError,
    );
  });
});

describe("ApplyProPricePrefillHandler — l'écriture", () => {
  it("écrit la seule déclinaison à tarif propre et sans saisie, journalisée et émise", async () => {
    const products = catalogue();
    const journal = new RecordingJournal();
    const emitter = new RecordingCatalogEmitter();

    await apply(products, undefined, journal, emitter);

    const stored = new Map(products.stored?.variants.map((v) => [v.id, v.proPriceMillicents]));
    expect(stored.get("v_own")).toBe(2_400_000);
    expect(stored.get("v_aligned")).toBeNull();
    expect(stored.get("v_entered")).toBe(777_777);
    expect(stored.get("v_unpriced")).toBeNull();
    expect(journal.types()).toEqual(["product.pro_price_prefilled"]);
    expect(journal.entries[0]?.payload).toMatchObject({
      variant: { id: "v_own" },
      proPriceMillicents: 2_400_000,
      ratioBp: 9_000,
      vatPercent: 20,
    });
    expect(emitter.products).toEqual([[PRODUCT_ID]]);
  });

  it("est sans effet la seconde fois", async () => {
    const products = catalogue();
    await apply(products);
    const journal = new RecordingJournal();

    await apply(products, undefined, journal);

    expect(journal.types()).toEqual([]);
  });

  it("refuse tout au moindre écart, avant la première écriture", async () => {
    const products = catalogue();

    await expect(
      apply(products, FixedAccountingRules.with("entered", 9_000)),
    ).rejects.toBeInstanceOf(ProPricePrefillMismatchError);
    expect(products.stored?.variants.find((v) => v.id === "v_own")?.proPriceMillicents).toBeNull();
  });
});

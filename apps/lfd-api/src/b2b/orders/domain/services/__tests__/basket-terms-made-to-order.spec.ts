import type { OrderLineClassification } from "../../ports/order-line-classification.reader.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import { basketTermsOf } from "../basket-terms.js";

/**
 * Le chiffrage scelle le marqueur « sur mesure » lu au catalogue (plan
 * `documentation/catalogue/plan-sur-mesure-partout.md`, M1) : une ligne neuve
 * prend celui du jour, une ligne gardée en révision garde le sien.
 *
 * Déménagée d'`order-composition-made-to-order.spec.ts` avec la règle
 * (`OrderComposition.draftOf` → `basketTermsOf`, lot L1a de
 * `plan-un-seul-assemblage.md`) : mêmes cas.
 */
const LINE: OrderLineInput = {
  sku: "GAT-001",
  productName: "Gâteau",
  unitPriceMillicents: 1_000_000,
  vatRate: 5.5,
  saleUnit: "piece",
  quantity: 1,
};

function marked(madeToOrder: boolean): OrderLineClassification {
  return {
    productId: "p_gateau",
    categoryId: "c_gateaux",
    categoryPath: ["c_gateaux"],
    madeToOrder,
  };
}

function draftLine(
  line: OrderLineInput,
  known: ReadonlyMap<string, OrderLineClassification>,
): OrderLineInput | undefined {
  return basketTermsOf({
    lines: [line],
    known,
    discount: {
      discountCents: 0,
      discountAdjustment: null,
      discountLabel: null,
      discountPromotionId: null,
      ineligibleSkus: new Set(),
      basketDiscounts: undefined,
      discountTerms: null,
    },
    deliveryFee: { cents: 0, adjustment: null },
    deliveryVatMode: "standard",
    vatMethod: "line_ht",
  }).lines[0];
}

describe("basketTermsOf — le marqueur « sur mesure » scellé", () => {
  it("une ligne neuve prend le marqueur du catalogue", () => {
    expect(draftLine(LINE, new Map([["GAT-001", marked(true)]]))?.madeToOrder).toBe(true);
    expect(draftLine(LINE, new Map([["GAT-001", marked(false)]]))?.madeToOrder).toBe(false);
  });

  it("un SKU que le catalogue ne range pas reste `null`, jamais `false`", () => {
    expect(draftLine(LINE, new Map())?.madeToOrder).toBeNull();
  });

  it("une ligne gardée en révision garde ce qu'elle a scellé, même si le marqueur a bougé", () => {
    const kept = { ...LINE, madeToOrder: true };
    expect(draftLine(kept, new Map([["GAT-001", marked(false)]]))?.madeToOrder).toBe(true);
  });

  it("une ligne d'avant le lot, gardée, reste `null` : le marqueur du jour ne la réécrit pas", () => {
    const kept = { ...LINE, madeToOrder: null };
    expect(draftLine(kept, new Map([["GAT-001", marked(true)]]))?.madeToOrder).toBeNull();
  });
});

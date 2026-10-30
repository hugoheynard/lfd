import type { OrderLineClassification } from "../../../domain/ports/order-line-classification.reader.js";
import type { OrderLineInput } from "../../../domain/value-objects/order-line.js";
import {
  OrderComposition,
  type ArrangedContent,
  type ResolvedContent,
} from "../order-composition.service.js";
import type { OrderContent } from "../order-content.js";

/**
 * La composition scelle le marqueur « sur mesure » lu au catalogue (plan
 * `documentation/catalogue/plan-sur-mesure-partout.md`, M1) : une ligne neuve
 * prend celui du jour, une ligne gardée en révision garde le sien.
 */
const CONTENT: OrderContent = {
  fulfillmentMethod: "pickup",
  deliveryAddress: null,
  deliveryAddressId: null,
  pickupAddressId: "pickup_1",
  requestedDeliveryDate: null,
  note: "",
  lines: [],
};

const ARRANGED: ArrangedContent = {
  agreed: {
    window: { value: null, source: "default" },
    contact: { value: null, source: "default" },
    signatureRequired: { value: false, source: "default" },
  },
  bookAddressId: null,
  deliveryVatMode: "standard",
};

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
  const resolved: ResolvedContent = {
    lines: [line],
    subtotalCents: 1_000,
    known,
    audience: "b2b",
    fulfillment: {
      deliveryZoneId: null,
      deliveryAddress: null,
      pickupAddress: null,
      discountCents: 0,
      discountAdjustment: null,
      discountLabel: null,
      ineligibleSkus: new Set(),
      deliveryFeeAdjustment: null,
      deliveryFeeCents: 0,
      globalWindowMode: null,
    },
  };
  return OrderComposition.draftOf(CONTENT, resolved, ARRANGED, "line_ht").lines[0];
}

describe("OrderComposition — le marqueur « sur mesure » scellé", () => {
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

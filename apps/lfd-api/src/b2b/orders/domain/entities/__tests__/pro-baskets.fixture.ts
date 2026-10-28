import {
  cartAdjustmentCents,
  discountCentsOf,
  type CartAdjustment,
  type DeliveryVatMode,
} from "@lfd/contracts";
import { lineTotalCents, pieces } from "@lfd/money";

import type { DraftOrderInput } from "../order.js";

/**
 * **Vingt paniers PRO** passés à `Order.draft` — la contre-épreuve du plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 9, lot C2) : le pro
 * ne change pas d'un centime. Les montants attendus ont été relevés sur le
 * code d'AVANT la voie B (2026-10-27) et sont écrits en dur dans la spec.
 */

/** `[prix HT en millicentimes, quantité, taux, éligible à la remise ?]`. */
type Line = readonly [number, number, number, boolean?];

export interface ProBasket {
  readonly name: string;
  readonly lines: readonly Line[];
  readonly discount?: CartAdjustment;
  readonly fee?: CartAdjustment;
  readonly vatMode?: DeliveryVatMode;
  readonly lateFee?: { readonly adjustment: CartAdjustment; readonly rate: number };
}

export const PRO_BASKETS: readonly ProBasket[] = [
  { name: "banana bread", lines: [[1_990_521, 1, 5.5]] },
  { name: "trente à 0,50 TTC", lines: Array.from({ length: 30 }, (): Line => [41_667, 1, 20]) },
  {
    name: "1,90 + 0,50",
    lines: [
      [180_095, 1, 5.5],
      [47_393, 1, 5.5],
    ],
  },
  { name: "douze croissants", lines: [[85_308, 12, 5.5]] },
  {
    name: "deux taux",
    lines: [
      [333_000, 1, 5.5],
      [333_000, 1, 20],
    ],
  },
  {
    name: "remise 10 % deux taux",
    lines: [
      [333_000, 1, 5.5],
      [333_000, 1, 20],
    ],
    discount: { mode: "percent", bp: 1_000 },
  },
  {
    name: "remise fixe 2 €",
    lines: [
      [250_000, 3, 5.5],
      [1_000_000, 1, 20],
    ],
    discount: { mode: "amount", cents: 200 },
  },
  {
    name: "remise fixe qui solde",
    lines: [[150_000, 1, 5.5]],
    discount: { mode: "amount", cents: 5_000 },
  },
  {
    name: "remise sur l'éligible seul",
    lines: [
      [120_000, 10, 5.5],
      [1_000_000, 1, 20, false],
    ],
    discount: { mode: "percent", bp: 1_500 },
  },
  {
    name: "ligne offerte",
    lines: [
      [0, 2, 5.5],
      [310_000, 4, 5.5],
    ],
  },
  {
    name: "port standard",
    lines: [[420_000, 5, 5.5]],
    fee: { mode: "amount", cents: 1_200 },
    vatMode: "standard",
  },
  {
    name: "port qui suit, deux taux",
    lines: [
      [420_000, 5, 5.5],
      [890_000, 2, 20],
    ],
    fee: { mode: "amount", cents: 1_500 },
    vatMode: "follows_goods",
  },
  {
    name: "port en pourcentage",
    lines: [[655_555, 7, 5.5]],
    fee: { mode: "percent", bp: 750 },
    vatMode: "standard",
  },
  {
    name: "port en pourcentage qui suit",
    lines: [
      [655_555, 7, 5.5],
      [123_457, 9, 10],
    ],
    fee: { mode: "percent", bp: 333 },
    vatMode: "follows_goods",
  },
  {
    name: "surtaxe de retard",
    lines: [[500_000, 6, 5.5]],
    lateFee: { adjustment: { mode: "percent", bp: 500 }, rate: 20 },
  },
  {
    name: "surtaxe et port",
    lines: [
      [777_777, 3, 5.5],
      [99_999, 11, 20],
    ],
    fee: { mode: "amount", cents: 900 },
    vatMode: "standard",
    lateFee: { adjustment: { mode: "amount", cents: 1_000 }, rate: 20 },
  },
  {
    name: "taux 2,1 %",
    lines: [
      [3_063_000, 1, 2.1],
      [12_345, 13, 5.5],
    ],
  },
  {
    name: "grosse commande",
    lines: [
      [1_234_567, 48, 5.5],
      [2_345_678, 24, 20],
      [98_765, 120, 10],
    ],
  },
  {
    name: "remise 5 % trois taux",
    lines: [
      [1_111, 333, 5.5],
      [222_222, 7, 20],
      [55_555, 9, 10],
    ],
    discount: { mode: "percent", bp: 500 },
  },
  {
    name: "millicentimes impairs",
    lines: [
      [1_005, 1, 20],
      [1_015, 3, 5.5],
      [1_025, 7, 10],
    ],
  },
];

/** Le panier en entrée d'`Order.draft`, pour la société `co_pro`. */
export function proDraftInput(basket: ProBasket): DraftOrderInput {
  const lines = basket.lines.map(([price, quantity, vatRate, eligible], i) => ({
    sku: `SKU-${String(i)}`,
    productName: `Article ${String(i)}`,
    unitPriceMillicents: price,
    vatRate,
    quantity,
    saleUnit: "piece" as const,
    pickupDiscountEligible: eligible ?? true,
  }));
  const subtotal = lines.reduce(
    (sum, line) => sum + lineTotalCents(line.unitPriceMillicents, pieces(line.quantity)),
    0,
  );
  const eligible = lines.reduce(
    (sum, line) =>
      line.pickupDiscountEligible
        ? sum + lineTotalCents(line.unitPriceMillicents, pieces(line.quantity))
        : sum,
    0,
  );
  const delivery = basket.fee !== undefined;
  return {
    companyId: "co_pro",
    billedCompanyId: "co_pro",
    principal: null,
    placedByUserId: "user_pro",
    placedByStaffId: null,
    agreed: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    fulfillment: delivery
      ? {
          method: "delivery",
          deliveryZoneId: "zone_1",
          deliveryAddress: {
            label: "",
            ligne1: "1 rue du Test",
            ligne2: "",
            codePostal: "73000",
            ville: "Chambéry",
            pays: "France",
          },
          deliveryAddressId: null,
          pickupAddress: null,
        }
      : {
          method: "pickup",
          deliveryZoneId: null,
          deliveryAddress: null,
          deliveryAddressId: null,
          pickupAddress: {
            label: "Labo",
            ligne1: "5 rue du Four",
            ligne2: "",
            codePostal: "73000",
            ville: "Chambéry",
            pays: "France",
          },
        },
    requestedDeliveryDate: null,
    note: "",
    catalogVersionId: null,
    lines,
    discountCents: basket.discount === undefined ? 0 : discountCentsOf(basket.discount, eligible),
    discountAdjustment: basket.discount ?? null,
    deliveryFeeCents: basket.fee === undefined ? 0 : cartAdjustmentCents(basket.fee, subtotal),
    deliveryFeeAdjustment: basket.fee ?? null,
    lateFeeCents:
      basket.lateFee === undefined ? 0 : cartAdjustmentCents(basket.lateFee.adjustment, subtotal),
    lateFeeAdjustment:
      basket.lateFee === undefined
        ? null
        : { adjustment: basket.lateFee.adjustment, vatRatePercent: basket.lateFee.rate },
    deliveryVatMode: basket.vatMode ?? "standard",
    voucher: null,
    salesTerms: { document: "salesTerms", revision: null, fileId: null },
    locale: null,
  };
}

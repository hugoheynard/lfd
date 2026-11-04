import { millicentsFromCents } from "@lfd/money";

import { Order, type DraftOrderInput } from "../../../domain/entities/order.js";
import type { OrderSupplyDecision } from "../../../domain/value-objects/order-supply.js";

/**
 * Les commandes et le reste en vitrine des suites du circuit du jour J —
 * partagés par `shelf-circuit.service.spec.ts` et la concordance du lot L4
 * (`shelf-circuit-concordance.spec.ts`). « Aujourd'hui » est celui de la
 * porte du plan de `gateOf` (1er janvier 2026, Paris), comparé à cette seule
 * horloge figée (exception étroite du CLAUDE.md §5).
 */
export const TODAY = "2026-01-01";
export const SITE = "site_village";

export const SHELF_TODAY: OrderSupplyDecision = {
  supply: "shelf",
  today: TODAY,
  entryShortcut: null,
};

/** Une commande sur la vitrine du point, d'un seul article. */
export function shelfOrder(
  quantity: number,
  supply: OrderSupplyDecision = SHELF_TODAY,
  siteId: string | null = SITE,
): Order {
  const input: DraftOrderInput = {
    companyId: "co_1",
    billedCompanyId: "co_1",
    principal: null,
    placedByUserId: "usr_1",
    placedByStaffId: "staff_1",
    buyerKind: "registered",
    fulfillment: {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: {
        label: "Village",
        ligne1: "1 place du Village",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        ...(siteId === null ? {} : { siteId }),
      },
    },
    agreed: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    requestedDeliveryDate: new Date(`${TODAY}T00:00:00.000Z`),
    note: "",
    catalogVersionId: null,
    lines: [
      {
        sku: "VIE-001-1",
        productName: "Croissant",
        unitPriceMillicents: millicentsFromCents(120),
        vatRate: 5.5,
        saleUnit: "piece",
        quantity,
      },
    ],
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
    locale: null,
  };
  const order = Order.draft(input, supply);
  order.deferPayment();
  return order;
}

/** Le reste en vitrine de croissants : `left` pièces. */
export const CROISSANTS = (left: number) => [
  {
    sku: "VIE-001-1",
    label: "Croissant",
    saleUnit: "piece" as const,
    receivedQuantity: 10,
    estimatedStock: left,
  },
];

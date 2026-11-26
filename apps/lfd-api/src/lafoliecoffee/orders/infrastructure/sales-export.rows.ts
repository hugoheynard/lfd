import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import type {
  SalesExportClientele,
  SalesExportLine,
  SalesExportOrder,
} from "../domain/ports/sales-export.reader.js";
import { countsAsRevenue } from "../domain/services/sales-revenue-scope.js";
import type { SettlementVenue } from "../domain/value-objects/settlement-venue.js";
import { buyerKindOf } from "./order-buyer-kind.column.js";
import {
  BILLABLE_SELECT,
  ORDER_AMOUNTS_SELECT,
  billableOf,
  dayOf,
  orderAmountsOf,
  ttcByRateOf,
  vatMethodOf,
} from "./order-money-columns.js";

/** Les colonnes d'une ligne que l'export sert, et les remises qui la couvrent. */
const SALES_EXPORT_LINE_SELECT = {
  sku: true,
  productNameSnapshot: true,
  categoryId: true,
  quantity: true,
  saleUnit: true,
  unitPriceMillicents: true,
  lineTotalCents: true,
  vatRate: true,
  lineTotalTtcCents: true,
  discounts: { select: { orderDiscountId: true }, orderBy: { orderDiscountId: "asc" } },
} as const;

/**
 * Les colonnes d'une commande que l'export sert — ni personne, ni adresse,
 * ni note : rien de ce qui désigne quelqu'un ne sort de la requête.
 */
export const SALES_EXPORT_SELECT = {
  id: true,
  orderNumber: true,
  createdAt: true,
  receivedOn: true,
  status: true,
  cancelledAt: true,
  paymentStatus: true,
  settlementVenue: true,
  offerNature: true,
  offeredTotalCents: true,
  clientele: true,
  buyerKind: true,
  companyId: true,
  fulfillmentMethod: true,
  vatMethod: true,
  ttcByRate: true,
  ...ORDER_AMOUNTS_SELECT,
  ...BILLABLE_SELECT,
  lines: { select: SALES_EXPORT_LINE_SELECT, orderBy: { sku: "asc" } },
} as const;

/** Une ligne lue, sous la forme que le `select` rend. */
interface SalesExportLineRow {
  readonly sku: string;
  readonly productNameSnapshot: string;
  readonly categoryId: string | null;
  readonly quantity: number;
  readonly saleUnit: string;
  readonly unitPriceMillicents: number;
  readonly lineTotalCents: number;
  readonly vatRate: Prisma.Decimal;
  readonly lineTotalTtcCents: number | null;
  readonly discounts: readonly { readonly orderDiscountId: string }[];
}

/** Une commande lue, sous la forme que le `select` rend. */
export interface SalesExportOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly createdAt: Date;
  readonly receivedOn: Date | null;
  readonly status: OrderStatus;
  readonly cancelledAt: Date | null;
  readonly paymentStatus: PaymentStatus;
  readonly settlementVenue: SettlementVenue | null;
  readonly offerNature: string | null;
  readonly offeredTotalCents: number | null;
  readonly clientele: SalesExportClientele;
  readonly buyerKind: string;
  readonly companyId: string | null;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly vatMethod: string;
  readonly ttcByRate: Prisma.JsonValue;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly vatCents: number;
  readonly vatShares: Prisma.JsonValue;
  readonly totalCents: number;
  readonly billableSubtotalCents: number | null;
  readonly billableDiscountCents: number | null;
  readonly billableVoucherDiscountCents: number | null;
  readonly billableDeliveryFeeCents: number | null;
  readonly billableLateFeeCents: number | null;
  readonly billableVatCents: number | null;
  readonly billableVatShares: Prisma.JsonValue;
  readonly billableTotalCents: number | null;
  readonly settledOn: Date | null;
  readonly lines: readonly SalesExportLineRow[];
}

function lineOf(row: SalesExportLineRow): SalesExportLine {
  return {
    sku: row.sku,
    productName: row.productNameSnapshot,
    categoryId: row.categoryId,
    quantity: row.quantity,
    saleUnit: row.saleUnit,
    unitPriceMillicents: row.unitPriceMillicents,
    lineTotalCents: row.lineTotalCents,
    vatRate: row.vatRate.toNumber(),
    lineTotalTtcCents: row.lineTotalTtcCents,
    discountIds: row.discounts.map((discount) => discount.orderDiscountId),
  };
}

/**
 * Ligne → commande de l'export. Le verdict de CA est calculé ici, par le
 * périmètre partagé, sur les colonnes mêmes que `revenueWhere` filtre.
 *
 * @throws {UnknownOrderBuyerKindError} `buyer_kind` hors du CHECK.
 * @throws {UnknownOrderVatMethodError} `vat_method` hors du CHECK.
 * @throws {FrozenAdjustmentUnreadableError} `ttc_by_rate` d'une forme inconnue.
 */
export function salesExportOrderOf(row: SalesExportOrderRow): SalesExportOrder {
  const offered = row.offerNature !== null;
  const settled = billableOf(row);
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    placedAt: row.createdAt,
    receivedOn: dayOf(row.receivedOn),
    status: row.status,
    cancelledAt: row.cancelledAt,
    countsAsRevenue: countsAsRevenue({
      status: row.status,
      paymentStatus: row.paymentStatus,
      settlementVenue: row.settlementVenue,
      offered,
    }),
    paymentStatus: row.paymentStatus,
    settlementVenue: row.settlementVenue,
    offered,
    offerNature: row.offerNature,
    offeredTotalCents: row.offeredTotalCents,
    clientele: row.clientele,
    buyerKind: buyerKindOf(row.id, row.buyerKind),
    companyId: row.companyId,
    fulfillment: row.fulfillmentMethod,
    vatMethod: vatMethodOf(row.id, row.vatMethod),
    amounts: orderAmountsOf(row),
    ttcByRate: ttcByRateOf(row.id, row.ttcByRate),
    settlement: settled === null ? null : { amounts: settled, settledOn: dayOf(row.settledOn) },
    lines: row.lines.map(lineOf),
  };
}

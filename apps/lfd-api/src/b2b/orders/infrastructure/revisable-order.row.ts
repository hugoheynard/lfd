import {
  billingAddressPayloadSchema,
  contentLocaleSchema,
  deliveryVatModeSchema,
  lateFeeAdjustmentSchema,
  pickupSnapshotSchema,
  salesTermsDocuments,
  type ContentLocale,
  type FulfillmentMethod,
  type LateFeeAdjustment,
  type OrderStatus,
  type PaymentStatus,
  type SalesTermsDocument,
} from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import { refundPositionOf, type RefundStatus } from "../domain/entities/order-refund.js";
import type { RevisableOrder } from "../domain/entities/order-revision.js";
import type { OrderSalesTerms } from "../domain/entities/order-shapes.js";
import type { OrderLineSnapshot } from "../domain/value-objects/order-line.js";
import { fulfillmentOf } from "./order-fulfillment.parse.js";
import { parseAllergens, parseTrace, type OrderLineRow } from "./order-line-row.js";

/** La clé de ligne d'un texte de CGV → son document (cf. `PrismaOrderRepository`). */
const DOCUMENT_OF_ROW_KEY: ReadonlyMap<string, SalesTermsDocument> = new Map([
  ["sales-terms", salesTermsDocuments[0]],
  ["sales-terms-pro", salesTermsDocuments[1]],
]);

const LINE_SELECT = {
  sku: true,
  productNameSnapshot: true,
  unitPriceMillicents: true,
  vatRate: true,
  quantity: true,
  lineTotalCents: true,
  unitPriceTtcCents: true,
  lineTotalTtcCents: true,
  basePriceMillicents: true,
  pricingSteps: true,
  pricingFloored: true,
  pricingClampedToZero: true,
  pricingFloor: true,
  allergens: true,
  pricingCommitment: true,
  pricingRejected: true,
  pickupDiscountEligible: true,
  productId: true,
  categoryId: true,
} as const;

/**
 * Ce qu'une révision relit d'une commande (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1) — partagé par la
 * lecture sans verrou et par la relecture sous `FOR UPDATE`.
 */
export const REVISABLE_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  revision: true,
  companyId: true,
  billedCompanyId: true,
  principalCompanyId: true,
  principalSeesAmount: true,
  placedByUserId: true,
  placedByStaffId: true,
  status: true,
  paymentStatus: true,
  totalCents: true,
  stripePaymentIntentId: true,
  cancelledAt: true,
  refunds: { select: { amountCents: true, status: true } },
  requestedDeliveryDate: true,
  fulfillmentMethod: true,
  deliveryZoneId: true,
  deliveryAddressSnapshot: true,
  deliveryAddressId: true,
  pickupAddress: true,
  fulfillment: true,
  note: true,
  lateFeeAdjustment: true,
  deliveryVatMode: true,
  loyaltyVoucherId: true,
  voucherDiscountCents: true,
  salesTermsKey: true,
  salesTermsRevision: true,
  salesTermsFileId: true,
  locale: true,
  catalogVersionId: true,
  // Un départ décidé sur UN envoi suffit à figer la commande (plan E7 reliquat, LB).
  shortfallDecisions: { select: { id: true }, take: 1 },
  lines: { select: LINE_SELECT, orderBy: { sku: "asc" } },
} as const;

interface RevisableLineRow extends OrderLineRow {
  readonly productId: string | null;
  readonly categoryId: string | null;
}

/** La forme que Prisma rend pour {@link REVISABLE_ORDER_SELECT}. */
export interface RevisableOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly revision: number;
  readonly companyId: string | null;
  readonly billedCompanyId: string | null;
  readonly principalCompanyId: string | null;
  readonly principalSeesAmount: boolean | null;
  readonly placedByUserId: string;
  readonly placedByStaffId: string | null;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  readonly stripePaymentIntentId: string | null;
  readonly cancelledAt: Date | null;
  readonly refunds: readonly { readonly amountCents: number; readonly status: RefundStatus }[];
  readonly requestedDeliveryDate: Date | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryZoneId: string | null;
  readonly deliveryAddressSnapshot: Prisma.JsonValue | null;
  readonly deliveryAddressId: string | null;
  readonly pickupAddress: Prisma.JsonValue | null;
  readonly fulfillment: Prisma.JsonValue | null;
  readonly note: string;
  readonly lateFeeAdjustment: Prisma.JsonValue | null;
  readonly deliveryVatMode: string | null;
  readonly loyaltyVoucherId: string | null;
  readonly voucherDiscountCents: number;
  readonly salesTermsKey: string | null;
  readonly salesTermsRevision: number | null;
  readonly salesTermsFileId: string | null;
  readonly locale: string | null;
  readonly catalogVersionId: string | null;
  readonly shortfallDecisions: readonly { readonly id: string }[];
  readonly lines: readonly RevisableLineRow[];
}

/** Ligne → la commande telle qu'on la modifie. Les JSON sont validés, jamais castés. */
export function toRevisableOrder(row: RevisableOrderRow): RevisableOrder {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    revision: row.revision,
    companyId: row.companyId,
    billedCompanyId: row.billedCompanyId,
    principal:
      row.principalCompanyId === null || row.principalSeesAmount === null
        ? null
        : { companyId: row.principalCompanyId, seesAmount: row.principalSeesAmount },
    placedByUserId: row.placedByUserId,
    placedByStaffId: row.placedByStaffId,
    status: row.status,
    paymentStatus: row.paymentStatus,
    totalCents: row.totalCents,
    shortfallDecided: row.shortfallDecisions.length > 0,
    stripePaymentIntentId: row.stripePaymentIntentId,
    cancelledAt: row.cancelledAt,
    refunds: refundPositionOf(row.totalCents, row.refunds),
    serviceDay:
      row.requestedDeliveryDate === null
        ? null
        : row.requestedDeliveryDate.toISOString().slice(0, 10),
    fulfillment: {
      method: row.fulfillmentMethod,
      deliveryZoneId: row.deliveryZoneId,
      deliveryAddress:
        row.deliveryAddressSnapshot === null
          ? null
          : billingAddressPayloadSchema.parse(row.deliveryAddressSnapshot),
      deliveryAddressId: row.deliveryAddressId,
      pickupAddress:
        row.pickupAddress === null ? null : pickupSnapshotSchema.parse(row.pickupAddress),
    },
    agreed: fulfillmentOf(row.fulfillment),
    note: row.note,
    lines: row.lines.map(toLineSnapshot),
    lateFeeAdjustment: lateFeeOf(row.lateFeeAdjustment),
    deliveryVatMode:
      row.deliveryVatMode === null ? null : deliveryVatModeSchema.parse(row.deliveryVatMode),
    voucher:
      row.loyaltyVoucherId === null
        ? null
        : { id: row.loyaltyVoucherId, appliedCents: row.voucherDiscountCents },
    salesTerms: salesTermsOf(row),
    locale: localeOf(row.locale),
    catalogVersionId: row.catalogVersionId,
  };
}

function toLineSnapshot(line: RevisableLineRow): OrderLineSnapshot {
  return {
    sku: line.sku,
    productName: line.productNameSnapshot,
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate.toNumber(),
    quantity: line.quantity,
    lineTotalCents: line.lineTotalCents,
    unitPriceTtcCents: line.unitPriceTtcCents,
    lineTotalTtcCents: line.lineTotalTtcCents,
    pricing: parseTrace(line),
    allergens: parseAllergens(line.allergens),
    pickupDiscountEligible: line.pickupDiscountEligible,
    productId: line.productId,
    categoryId: line.categoryId,
  };
}

function lateFeeOf(value: Prisma.JsonValue | null): LateFeeAdjustment | null {
  return value === null ? null : lateFeeAdjustmentSchema.parse(value);
}

/** `null` : une commande d'avant les CGV figées — la révision la refuse. */
function salesTermsOf(row: RevisableOrderRow): OrderSalesTerms | null {
  const document =
    row.salesTermsKey === null ? undefined : DOCUMENT_OF_ROW_KEY.get(row.salesTermsKey);
  if (document === undefined) {
    return null;
  }
  return { document, revision: row.salesTermsRevision, fileId: row.salesTermsFileId };
}

function localeOf(value: string | null): ContentLocale | null {
  if (value === null) {
    return null;
  }
  const parsed = contentLocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

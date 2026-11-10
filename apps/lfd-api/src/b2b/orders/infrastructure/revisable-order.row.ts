import {
  billingAddressPayloadSchema,
  cartAdjustmentSchema,
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
import { orderPretaxCents } from "@lfd/money";

import type { Prisma } from "../../../platform/database/client/client.js";
import type { RevisableOrder } from "../domain/entities/order-revision.js";
import type { OrderSalesTerms } from "../domain/entities/order-shapes.js";
import type { OrderLineSnapshot } from "../domain/value-objects/order-line.js";
import type { RefundPosition } from "../domain/value-objects/refund-position.js";
import type {
  OrderEntryOrigin,
  OrderEntryShortcut,
  OrderSupply,
} from "../domain/value-objects/order-supply.js";
import { buyerKindOf } from "./order-buyer-kind.column.js";
import {
  frozenLabelOf,
  REVISABLE_ORDER_DISCOUNTS_SELECT,
  revisableDiscountOf,
  type RevisableOrderDiscountRow,
} from "./revisable-discounts.columns.js";
import { fixedCustomerCancellationOf } from "../cancellation/infrastructure/customer-cancellation.columns.js";
import { fulfillmentOf } from "./order-fulfillment.parse.js";
import { vatMethodOf } from "./order-money-columns.js";
import {
  orderLineSaleUnitOf,
  parseAllergens,
  parseTrace,
  type OrderLineRow,
} from "./order-line-row.js";

/** La clé de ligne d'un texte de CGV → son document (cf. `PrismaOrderRepository`). */
const DOCUMENT_OF_ROW_KEY: ReadonlyMap<string, SalesTermsDocument> = new Map([
  ["sales-terms", salesTermsDocuments[0]],
  ["sales-terms-pro", salesTermsDocuments[1]],
]);

const LINE_SELECT = {
  id: true,
  sku: true,
  productNameSnapshot: true,
  unitPriceMillicents: true,
  vatRate: true,
  quantity: true,
  saleUnit: true,
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
  madeToOrder: true,
  productId: true,
  categoryId: true,
} as const;

/**
 * Ce qu'une révision relit d'une commande (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») — partagé par la
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
  buyerKind: true,
  status: true,
  paymentStatus: true,
  totalCents: true,
  // Les gestes du HT (`orderPretaxCents`) : l'e-mail « commande modifiée » dit l'ancien HT d'un pro.
  subtotalCents: true,
  deliveryFeeCents: true,
  lateFeeCents: true,
  stripePaymentIntentId: true,
  cancelledAt: true,
  requestedDeliveryDate: true,
  supply: true,
  entryShortcut: true,
  entryOrigin: true,
  fulfillmentMethod: true,
  deliveryZoneId: true,
  deliveryAddressSnapshot: true,
  deliveryAddressId: true,
  pickupAddress: true,
  fulfillment: true,
  note: true,
  lateFeeAdjustment: true,
  discountPromotionId: true,
  discountAdjustment: true,
  discountLabel: true,
  discountCents: true,
  discountTtcCents: true,
  deliveryVatMode: true,
  deliveryFeeAdjustment: true,
  freeDeliveryThresholdCents: true,
  loyaltyVoucherId: true,
  voucherDiscountCents: true,
  vatMethod: true,
  voucherTtcCents: true,
  salesTermsKey: true,
  salesTermsRevision: true,
  salesTermsFileId: true,
  locale: true,
  catalogVersionId: true,
  customerCancellableUntil: true,
  customerCancellationFixed: true,
  customerCancellationHoursBefore: true,
  // Un départ décidé sur UN envoi suffit à figer la commande (plan E7 reliquat, LB).
  shortfallDecisions: { select: { id: true }, take: 1 },
  lines: { select: LINE_SELECT, orderBy: { sku: "asc" } },
  // Les remises ACTIVES, par rang, avec leurs termes figés : ce que la
  // révision rejoue (plan des remises acquises, § 10.2) et l'« avant » de L9.
  discounts: REVISABLE_ORDER_DISCOUNTS_SELECT,
} as const;

interface RevisableLineRow extends OrderLineRow {
  readonly id: string;
  readonly productId: string | null;
  readonly categoryId: string | null;
  readonly madeToOrder: boolean | null;
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
  readonly buyerKind: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  readonly subtotalCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly stripePaymentIntentId: string | null;
  readonly cancelledAt: Date | null;
  readonly requestedDeliveryDate: Date | null;
  readonly supply: OrderSupply;
  readonly entryShortcut: OrderEntryShortcut | null;
  readonly entryOrigin: OrderEntryOrigin | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryZoneId: string | null;
  readonly deliveryAddressSnapshot: Prisma.JsonValue | null;
  readonly deliveryAddressId: string | null;
  readonly pickupAddress: Prisma.JsonValue | null;
  readonly fulfillment: Prisma.JsonValue | null;
  readonly note: string;
  readonly lateFeeAdjustment: Prisma.JsonValue | null;
  readonly discountPromotionId: string | null;
  readonly discountAdjustment: Prisma.JsonValue | null;
  readonly discountLabel: Prisma.JsonValue | null;
  readonly discountCents: number;
  readonly discountTtcCents: number | null;
  readonly deliveryVatMode: string | null;
  readonly deliveryFeeAdjustment: Prisma.JsonValue | null;
  readonly freeDeliveryThresholdCents: number | null;
  readonly loyaltyVoucherId: string | null;
  readonly voucherDiscountCents: number;
  readonly vatMethod: string;
  readonly voucherTtcCents: number | null;
  readonly salesTermsKey: string | null;
  readonly salesTermsRevision: number | null;
  readonly salesTermsFileId: string | null;
  readonly locale: string | null;
  readonly catalogVersionId: string | null;
  readonly customerCancellableUntil: Date | null;
  readonly customerCancellationFixed: boolean;
  readonly customerCancellationHoursBefore: number | null;
  readonly shortfallDecisions: readonly { readonly id: string }[];
  readonly lines: readonly RevisableLineRow[];
  readonly discounts: readonly RevisableOrderDiscountRow[];
}

/**
 * Ligne → la commande telle qu'on la modifie. Les JSON sont validés, jamais
 * castés. Le reste à rendre vient du bloc `card-payment` (lot P1.c), lu à côté.
 */
export function toRevisableOrder(row: RevisableOrderRow, refunds: RefundPosition): RevisableOrder {
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
    buyerKind: buyerKindOf(row.id, row.buyerKind),
    status: row.status,
    paymentStatus: row.paymentStatus,
    totalCents: row.totalCents,
    pretaxCents: orderPretaxCents(row),
    shortfallDecided: row.shortfallDecisions.length > 0,
    stripePaymentIntentId: row.stripePaymentIntentId,
    cancelledAt: row.cancelledAt,
    refunds,
    serviceDay:
      row.requestedDeliveryDate === null
        ? null
        : row.requestedDeliveryDate.toISOString().slice(0, 10),
    supply: row.supply,
    entryShortcut: row.entryShortcut,
    entryOrigin: row.entryOrigin,
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
    discountPromotionId: row.discountPromotionId,
    discountAdjustment:
      row.discountAdjustment === null ? null : cartAdjustmentSchema.parse(row.discountAdjustment),
    activeDiscounts: row.discounts.map((discount) =>
      revisableDiscountOf(row.id, discount, row.lines),
    ),
    discountLabel: frozenLabelOf(row.discountLabel),
    discountCents: row.discountCents,
    discountTtcCents: row.discountTtcCents,
    deliveryVatMode:
      row.deliveryVatMode === null ? null : deliveryVatModeSchema.parse(row.deliveryVatMode),
    deliveryFeeAdjustment:
      row.deliveryFeeAdjustment === null
        ? null
        : cartAdjustmentSchema.parse(row.deliveryFeeAdjustment),
    freeDeliveryThresholdCents: row.freeDeliveryThresholdCents,
    vatMethod: vatMethodOf(row.id, row.vatMethod),
    // Ce que le bon a servi, dans l'unité de la méthode : sa valeur faciale
    // TTC pour `exact_ht` (plan du centime, § 5), le HT pour `line_ht`.
    voucher:
      row.loyaltyVoucherId === null
        ? null
        : {
            id: row.loyaltyVoucherId,
            appliedCents: row.voucherTtcCents ?? row.voucherDiscountCents,
          },
    salesTerms: salesTermsOf(row),
    locale: localeOf(row.locale),
    catalogVersionId: row.catalogVersionId,
    customerCancellation: fixedCustomerCancellationOf(row),
    customerCancellableUntil: row.customerCancellableUntil,
  };
}

function toLineSnapshot(line: RevisableLineRow): OrderLineSnapshot {
  return {
    sku: line.sku,
    productName: line.productNameSnapshot,
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate.toNumber(),
    quantity: line.quantity,
    saleUnit: orderLineSaleUnitOf(line.sku, line.saleUnit),
    lineTotalCents: line.lineTotalCents,
    unitPriceTtcCents: line.unitPriceTtcCents,
    lineTotalTtcCents: line.lineTotalTtcCents,
    pricing: parseTrace(line),
    allergens: parseAllergens(line.allergens),
    pickupDiscountEligible: line.pickupDiscountEligible,
    productId: line.productId,
    categoryId: line.categoryId,
    madeToOrder: line.madeToOrder,
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

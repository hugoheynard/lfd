import type { Provider, Type } from "@nestjs/common";

import { RefundShortfallHandler } from "./application/commands/refund-shortfall.handler.js";
import { RefundShortfallOnBillingSettled } from "./application/handlers/refund-shortfall-on-billing-settled.handler.js";
import { AdminShortfallRefundView } from "./application/services/admin-shortfall-refund-view.js";
import { RefundablePayments } from "./application/services/refundable-payments.js";
import { ShortfallRefundMoneyReader } from "./application/services/shortfall-refund-money.js";
import { ShortfallRefunding } from "./application/services/shortfall-refunding.js";
import { OrderShortfallRefundReader } from "./domain/ports/order-shortfall-refund.reader.js";
import {
  ShortfallRefundSubjectLock,
  ShortfallRefundSubjectReader,
} from "./domain/ports/shortfall-refund-subject.js";
import { AdminOrderShortfallRefundController } from "./http/admin-order-shortfall-refund.controller.js";
import { CardOrderShortfallRefundReader } from "./infrastructure/card-order-shortfall-refund.reader.js";
import { PrismaShortfallRefundSubjects } from "./infrastructure/prisma-shortfall-refund-subject.js";

/**
 * **Le reste d'un départ incomplet payé par carte, remboursé au solde** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, lot E9a) :
 * l'abonné au solde, le geste « Rembourser le reste », sa lecture sur la
 * fiche, et le gel du solde (`OrderShortfallRefundReader`, exporté pour
 * l'écrivain du solde). `RefundablePayments` est partagé avec la baisse
 * d'une révision (`RevisionCardRefund`).
 */
export const ORDER_SHORTFALL_REFUND_PROVIDERS: readonly Provider[] = [
  RefundablePayments,
  ShortfallRefundMoneyReader,
  ShortfallRefunding,
  RefundShortfallOnBillingSettled,
  RefundShortfallHandler,
  AdminShortfallRefundView,
  PrismaShortfallRefundSubjects,
  { provide: ShortfallRefundSubjectLock, useExisting: PrismaShortfallRefundSubjects },
  { provide: ShortfallRefundSubjectReader, useExisting: PrismaShortfallRefundSubjects },
  { provide: OrderShortfallRefundReader, useClass: CardOrderShortfallRefundReader },
];

/** Ce que l'écrivain du solde (`delivery-notes`) lit pour geler un solde déjà remboursé. */
export const ORDER_SHORTFALL_REFUND_EXPORTS = [OrderShortfallRefundReader] as const;

export const ORDER_SHORTFALL_REFUND_CONTROLLERS: readonly Type[] = [
  AdminOrderShortfallRefundController,
];

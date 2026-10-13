import type { Provider, Type } from "@nestjs/common";

import { IssueOrderRefundHandler } from "./application/commands/issue-order-refund.handler.js";
import { RetryOrderRefundHandler } from "./application/commands/retry-order-refund.handler.js";
import { SweepOrderRefundsHandler } from "./application/commands/sweep-order-refunds.handler.js";
import { RefundPaidAfterCancellation } from "./application/handlers/refund-paid-after-cancellation.handler.js";
import { ReopenRefundOnReversal } from "./application/handlers/reopen-refund-on-reversal.handler.js";
import { RingRefundFailed } from "./application/handlers/ring-refund-failed.handler.js";
import { AdminOrderRefundView } from "./application/services/admin-order-refund-view.js";
import { CancellationRefundRequester } from "./application/services/cancellation-refund-requester.js";
import {
  BusOrderRefundDispatch,
  OrderRefundDispatch,
} from "./application/services/order-refund-dispatch.js";
import { RefundAttentionBell } from "./application/services/refund-attention-bell.js";
import { RefundIssuanceRecorder } from "./application/services/refund-issuance-recorder.js";
import { OrderRefundRequestLease } from "./domain/ports/order-refund-request.lease.js";
import { OrderRefundRequestReader } from "./domain/ports/order-refund-request.reader.js";
import { OrderRefundRequestRepository } from "./domain/ports/order-refund-request.repository.js";
import { AdminOrderRefundsController } from "./http/admin-order-refunds.controller.js";
import { OrderRefundSweepController } from "./http/order-refund-sweep.controller.js";
import { PrismaOrderRefundRequestLease } from "./infrastructure/prisma-order-refund-request.lease.js";
import { PrismaOrderRefundRequestReader } from "./infrastructure/prisma-order-refund-request.reader.js";
import { PrismaOrderRefundRequestRepository } from "./infrastructure/prisma-order-refund-request.repository.js";

/**
 * Les providers du lot C4 (doc `documentation/commandes/annulation/annulation-par-le-staff.md`) :
 * la demande de remboursement, son exécuteur, son balayage, « Relancer », et
 * les abonnés qui ouvrent ou signalent une demande. À part du module, qui
 * dépasse déjà la taille d'un fichier. Le port `PaymentRefunder` vient de
 * `PaymentsModule`.
 */
export const ORDER_REFUND_PROVIDERS: readonly Provider[] = [
  { provide: OrderRefundRequestRepository, useClass: PrismaOrderRefundRequestRepository },
  { provide: OrderRefundRequestLease, useClass: PrismaOrderRefundRequestLease },
  { provide: OrderRefundRequestReader, useClass: PrismaOrderRefundRequestReader },
  CancellationRefundRequester,
  { provide: OrderRefundDispatch, useClass: BusOrderRefundDispatch },
  RefundAttentionBell,
  RefundIssuanceRecorder,
  AdminOrderRefundView,
  IssueOrderRefundHandler,
  SweepOrderRefundsHandler,
  RetryOrderRefundHandler,
  // L'encaissé après annulation se rembourse tout seul (C4.11) — il remplace
  // la cloche « à rembourser depuis Stripe » (`RingRefundDue`, retirée).
  RefundPaidAfterCancellation,
  RingRefundFailed,
  ReopenRefundOnReversal,
];

export const ORDER_REFUND_CONTROLLERS: readonly Type[] = [
  AdminOrderRefundsController,
  OrderRefundSweepController,
];

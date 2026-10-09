import type { Provider } from "@nestjs/common";

import { IssueCardInvoiceHandler } from "./application/commands/issue-card-invoice.handler.js";
import { ReconcileRefundsHandler } from "./application/commands/reconcile-refunds.handler.js";
import { IssueCardInvoiceOnFulfilled } from "./application/handlers/issue-card-invoice-on-fulfilled.handler.js";
import { IssueCardInvoiceOnPaid } from "./application/handlers/issue-card-invoice-on-paid.handler.js";
import { ReconcileRefundsOnRefund } from "./application/handlers/reconcile-refunds-on-refund.handler.js";
import { RingRefundNotCredited } from "./application/handlers/ring-refund-not-credited.handler.js";
import { GetCardInvoiceSignalsHandler } from "./application/queries/get-card-invoice-signals.handler.js";
import { ListOrderInvoicesHandler } from "./application/queries/list-order-invoices.handler.js";
import { RefundReconciler } from "./application/services/refund-reconciler.js";
import { CardInvoiceOutcomes } from "./domain/ports/card-invoice-outcomes.js";
import { CardInvoiceSignalsReader } from "./domain/ports/card-invoice-signals.reader.js";
import { CardInvoicingReader } from "./domain/ports/card-invoicing.reader.js";
import { OrderInvoicesReader } from "./domain/ports/order-invoices.reader.js";
import { OrderInvoicingLock } from "./domain/ports/order-invoicing-lock.js";
import { RefundCreditLinks, RefundsToCreditReader } from "./domain/ports/refunds-to-credit.js";
import {
  PrismaCardInvoiceOutcomes,
  PrismaCardInvoiceSignalsReader,
} from "./infrastructure/prisma-card-invoice-outcomes.js";
import { PrismaCardInvoicingReader } from "./infrastructure/prisma-card-invoicing.reader.js";
import { PrismaOrderInvoicesReader } from "./infrastructure/prisma-order-invoices.reader.js";
import { PrismaOrderInvoicingLock } from "./infrastructure/prisma-order-invoicing-lock.js";
import {
  PrismaRefundCreditLinks,
  PrismaRefundsToCreditReader,
} from "./infrastructure/prisma-refunds-to-credit.js";

/**
 * Les providers du lot E5 (plan `facture-carte-et-remboursements.md`) :
 * la facture carte, ses issues signalées, l'avoir des remboursements. À part
 * du module, qui dépasse déjà la taille d'un fichier.
 */
export const CARD_INVOICE_PROVIDERS: readonly Provider[] = [
  { provide: CardInvoicingReader, useClass: PrismaCardInvoicingReader },
  { provide: OrderInvoicingLock, useClass: PrismaOrderInvoicingLock },
  { provide: CardInvoiceOutcomes, useClass: PrismaCardInvoiceOutcomes },
  { provide: CardInvoiceSignalsReader, useClass: PrismaCardInvoiceSignalsReader },
  { provide: OrderInvoicesReader, useClass: PrismaOrderInvoicesReader },
  { provide: RefundsToCreditReader, useClass: PrismaRefundsToCreditReader },
  { provide: RefundCreditLinks, useClass: PrismaRefundCreditLinks },
  RefundReconciler,
  IssueCardInvoiceHandler,
  ReconcileRefundsHandler,
  IssueCardInvoiceOnFulfilled,
  IssueCardInvoiceOnPaid,
  ReconcileRefundsOnRefund,
  RingRefundNotCredited,
  GetCardInvoiceSignalsHandler,
  ListOrderInvoicesHandler,
];

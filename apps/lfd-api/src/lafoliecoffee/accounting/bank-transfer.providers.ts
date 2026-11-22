import type { Provider, Type } from "@nestjs/common";

import { CheckBankTransferConsistencyHandler } from "./application/commands/check-bank-transfer-consistency.handler.js";
import { RecordBankTransferHandler } from "./application/commands/record-bank-transfer.handler.js";
import { RingBankTransferGap } from "./application/handlers/ring-bank-transfer-gap.handler.js";
import { ListUnpaidTransferInvoicesHandler } from "./application/queries/list-unpaid-transfer-invoices.handler.js";
import { PreviewBankTransferHandler } from "./application/queries/preview-bank-transfer.handler.js";
import { BankTransferTraceReader } from "./domain/ports/bank-transfer-trace.reader.js";
import { TransferInvoicesReader } from "./domain/ports/transfer-invoices.reader.js";
import { UnpaidTransferInvoicesReader } from "./domain/ports/unpaid-transfer-invoices.reader.js";
import { AdminBankTransfersController } from "./http/admin-bank-transfers.controller.js";
import { BankTransferConsistencyController } from "./http/bank-transfer-consistency.controller.js";
import { PrismaBankTransferTraceReader } from "./infrastructure/prisma-bank-transfer-trace.reader.js";
import { PrismaTransferInvoicesReader } from "./infrastructure/prisma-transfer-invoices.reader.js";
import { PrismaUnpaidTransferInvoicesReader } from "./infrastructure/prisma-unpaid-transfer-invoices.reader.js";

/**
 * Le virement reçu et les impayés de factures au virement (plan
 * `le-paiement-par-virement.md`, T3 : V7, V8, C7). À part du
 * module, qui dépasse déjà la taille d'un fichier. Le virement lui-même est
 * enregistré par le bloc `payment` (`BankTransfers`, global) ; la facturation
 * en garde la trace sur ses bons, et la compare chaque nuit (§3.6 du plan
 * `plan-le-virement-recu-dans-payment.md`).
 */
export const BANK_TRANSFER_PROVIDERS: readonly Provider[] = [
  { provide: TransferInvoicesReader, useClass: PrismaTransferInvoicesReader },
  { provide: UnpaidTransferInvoicesReader, useClass: PrismaUnpaidTransferInvoicesReader },
  { provide: BankTransferTraceReader, useClass: PrismaBankTransferTraceReader },
  RecordBankTransferHandler,
  ListUnpaidTransferInvoicesHandler,
  PreviewBankTransferHandler,
  CheckBankTransferConsistencyHandler,
  RingBankTransferGap,
];

export const BANK_TRANSFER_CONTROLLERS: readonly Type[] = [
  AdminBankTransfersController,
  BankTransferConsistencyController,
];

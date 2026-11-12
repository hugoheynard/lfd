import type { Provider, Type } from "@nestjs/common";

import { RecordBankTransferHandler } from "./application/commands/record-bank-transfer.handler.js";
import { ListUnpaidTransferInvoicesHandler } from "./application/queries/list-unpaid-transfer-invoices.handler.js";
import { PreviewBankTransferHandler } from "./application/queries/preview-bank-transfer.handler.js";
import { ReceivedBankTransferRepository } from "./domain/ports/received-bank-transfer.repository.js";
import { TransferInvoicesReader } from "./domain/ports/transfer-invoices.reader.js";
import { UnpaidTransferInvoicesReader } from "./domain/ports/unpaid-transfer-invoices.reader.js";
import { AdminBankTransfersController } from "./http/admin-bank-transfers.controller.js";
import { PrismaReceivedBankTransferRepository } from "./infrastructure/prisma-received-bank-transfer.repository.js";
import { PrismaTransferInvoicesReader } from "./infrastructure/prisma-transfer-invoices.reader.js";
import { PrismaUnpaidTransferInvoicesReader } from "./infrastructure/prisma-unpaid-transfer-invoices.reader.js";

/**
 * Le virement reçu et les impayés de factures au virement (plan
 * `le-paiement-par-virement.md`, T3 : V7, V8, C7). À part du
 * module, qui dépasse déjà la taille d'un fichier.
 */
export const BANK_TRANSFER_PROVIDERS: readonly Provider[] = [
  { provide: TransferInvoicesReader, useClass: PrismaTransferInvoicesReader },
  { provide: ReceivedBankTransferRepository, useClass: PrismaReceivedBankTransferRepository },
  { provide: UnpaidTransferInvoicesReader, useClass: PrismaUnpaidTransferInvoicesReader },
  RecordBankTransferHandler,
  ListUnpaidTransferInvoicesHandler,
  PreviewBankTransferHandler,
];

export const BANK_TRANSFER_CONTROLLERS: readonly Type[] = [AdminBankTransfersController];

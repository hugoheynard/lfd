import { Global, Module } from "@nestjs/common";

import { BankTransfers } from "../channels/requests/bank-transfers.js";
import { BlockBankTransfers } from "./application/block-bank-transfers.js";
import { ReceivedTransferRepository } from "./domain/ports/received-transfer.repository.js";
import { RecordedTransfersReader } from "./domain/ports/recorded-transfers.reader.js";
import { TransferAllocationsReader } from "./domain/ports/transfer-allocations.reader.js";
import { PrismaReceivedTransferRepository } from "./infrastructure/prisma-received-transfer.repository.js";
import { PrismaRecordedTransfersReader } from "./infrastructure/prisma-recorded-transfers.reader.js";
import { PrismaTransferAllocationsReader } from "./infrastructure/prisma-transfer-allocations.reader.js";

/**
 * **Le virement reçu** (plan
 * `documentation/payment/plan-le-virement-recu-dans-payment.md`, lot D1) :
 * le mouvement d'argent et ses parts, sans métier.
 *
 * **Global**, comme `CardPaymentModule` et `PayLinkModule` : un bloc métier
 * n'atteint que le canal (`payment/channels/`), jamais ce module. Le bloc
 * déclare et implémente lui-même `BankTransfers` : aucun jeton à poser par
 * `appBootstrap`, qui importe seulement le module.
 */
@Global()
@Module({
  providers: [
    { provide: ReceivedTransferRepository, useClass: PrismaReceivedTransferRepository },
    { provide: TransferAllocationsReader, useClass: PrismaTransferAllocationsReader },
    { provide: RecordedTransfersReader, useClass: PrismaRecordedTransfersReader },
    { provide: BankTransfers, useClass: BlockBankTransfers },
  ],
  exports: [BankTransfers],
})
export class BankTransferModule {}

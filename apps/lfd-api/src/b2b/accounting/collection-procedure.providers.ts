import type { Provider, Type } from "@nestjs/common";

import { AttestBankReturnCheckHandler } from "./application/commands/attest-bank-return-check.handler.js";
import { AttestCollectionBatchHandler } from "./application/commands/attest-collection-batch.handler.js";
import { WithdrawCollectionBatchAttestationHandler } from "./application/commands/withdraw-collection-batch-attestation.handler.js";
import { WithdrawBankReturnCheckHandler } from "./application/commands/withdraw-bank-return-check.handler.js";
import { GetCollectionProcedureHandler } from "./application/queries/get-collection-procedure.handler.js";
import { ListCollectionProceduresHandler } from "./application/queries/list-collection-procedures.handler.js";
import { BankReturnCheckRepository } from "./domain/ports/bank-return-check.repository.js";
import { BankReturnChecksReader } from "./domain/ports/bank-return-checks.reader.js";
import { CollectionBatchAttestationRepository } from "./domain/ports/collection-batch-attestation.repository.js";
import { CollectionBatchAttestationsReader } from "./domain/ports/collection-batch-attestations.reader.js";
import { AdminCollectionBatchAttestationsController } from "./http/admin-collection-batch-attestations.controller.js";
import { AdminBankReturnChecksController } from "./http/admin-bank-return-checks.controller.js";
import { AdminCollectionProcedureController } from "./http/admin-collection-procedure.controller.js";
import { AdminCollectionProceduresController } from "./http/admin-collection-procedures.controller.js";
import { PrismaBankReturnCheckRepository } from "./infrastructure/prisma-bank-return-check.repository.js";
import { PrismaBankReturnChecksReader } from "./infrastructure/prisma-bank-return-checks.reader.js";
import { PrismaCollectionBatchAttestationRepository } from "./infrastructure/prisma-collection-batch-attestation.repository.js";
import { PrismaCollectionBatchAttestationsReader } from "./infrastructure/prisma-collection-batch-attestations.reader.js";

/**
 * La lecture d'état de la page « Procédure de prélèvement » (plan
 * `plan-page-procedure-de-prelevement.md`, P2) et, depuis P3, l'attestation
 * « Retours contrôlés » et les attestations du lot qu'elle seule lit. À part du module, qui dépasse déjà
 * la taille d'un fichier. Les autres ports lus sont ceux des cartes des
 * exports, des lots et des retours.
 */
export const COLLECTION_PROCEDURE_PROVIDERS: readonly Provider[] = [
  GetCollectionProcedureHandler,
  ListCollectionProceduresHandler,
  AttestBankReturnCheckHandler,
  WithdrawBankReturnCheckHandler,
  { provide: BankReturnCheckRepository, useClass: PrismaBankReturnCheckRepository },
  { provide: BankReturnChecksReader, useClass: PrismaBankReturnChecksReader },
  AttestCollectionBatchHandler,
  WithdrawCollectionBatchAttestationHandler,
  {
    provide: CollectionBatchAttestationRepository,
    useClass: PrismaCollectionBatchAttestationRepository,
  },
  { provide: CollectionBatchAttestationsReader, useClass: PrismaCollectionBatchAttestationsReader },
];

export const COLLECTION_PROCEDURE_CONTROLLERS: readonly Type[] = [
  AdminCollectionProcedureController,
  AdminCollectionProceduresController,
  AdminBankReturnChecksController,
  AdminCollectionBatchAttestationsController,
];

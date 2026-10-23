import type { Provider, Type } from "@nestjs/common";

import { AttestBankReturnCheckHandler } from "./application/commands/attest-bank-return-check.handler.js";
import { WithdrawBankReturnCheckHandler } from "./application/commands/withdraw-bank-return-check.handler.js";
import { GetCollectionProcedureHandler } from "./application/queries/get-collection-procedure.handler.js";
import { ListCollectionProceduresHandler } from "./application/queries/list-collection-procedures.handler.js";
import { BankReturnCheckRepository } from "./domain/ports/bank-return-check.repository.js";
import { BankReturnChecksReader } from "./domain/ports/bank-return-checks.reader.js";
import { AdminBankReturnChecksController } from "./http/admin-bank-return-checks.controller.js";
import { AdminCollectionProcedureController } from "./http/admin-collection-procedure.controller.js";
import { AdminCollectionProceduresController } from "./http/admin-collection-procedures.controller.js";
import { PrismaBankReturnCheckRepository } from "./infrastructure/prisma-bank-return-check.repository.js";
import { PrismaBankReturnChecksReader } from "./infrastructure/prisma-bank-return-checks.reader.js";

/**
 * La lecture d'état de la page « Procédure de prélèvement » (plan
 * `plan-page-procedure-de-prelevement.md`, P2) et, depuis P3, l'attestation
 * « Retours contrôlés » qu'elle seule lit. À part du module, qui dépasse déjà
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
];

export const COLLECTION_PROCEDURE_CONTROLLERS: readonly Type[] = [
  AdminCollectionProcedureController,
  AdminCollectionProceduresController,
  AdminBankReturnChecksController,
];

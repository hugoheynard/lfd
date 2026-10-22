import type { Provider } from "@nestjs/common";

import { DeclareOwnEstablishmentHandler } from "./application/commands/declare-own-establishment.handler.js";
import { GenerateCollectionTestHandler } from "./application/commands/generate-collection-test.handler.js";
import { MarkCollectionTestRefundedHandler } from "./application/commands/mark-collection-test-refunded.handler.js";
import { WithdrawOwnEstablishmentHandler } from "./application/commands/withdraw-own-establishment.handler.js";
import { ExportCollectionTestFileHandler } from "./application/queries/export-collection-test-file.handler.js";
import { ExportCollectionTestMandateHandler } from "./application/queries/export-collection-test-mandate.handler.js";
import { GetCollectionTestDebtorsHandler } from "./application/queries/get-collection-test-debtors.handler.js";
import { ListCollectionTestsHandler } from "./application/queries/list-collection-tests.handler.js";
import { ListOwnEstablishmentsHandler } from "./application/queries/list-own-establishments.handler.js";
import { BatchedMandatesReader } from "./domain/ports/batched-mandates.reader.js";
import { CollectionTestFileReader } from "./domain/ports/collection-test-file.reader.js";
import { CollectionTestReturnTargetsReader } from "./domain/ports/collection-test-return-targets.reader.js";
import { CollectionTestRepository } from "./domain/ports/collection-test.repository.js";
import { CollectionTestsReader } from "./domain/ports/collection-tests.reader.js";
import { EstablishmentCompaniesReader } from "./domain/ports/establishment-companies.reader.js";
import { OwnEstablishmentRepository } from "./domain/ports/own-establishment.repository.js";
import { OwnEstablishmentsReader } from "./domain/ports/own-establishments.reader.js";
import { AdminCollectionTestsController } from "./http/admin-collection-tests.controller.js";
import { AdminOwnEstablishmentsController } from "./http/admin-own-establishments.controller.js";
import { PrismaBatchedMandatesReader } from "./infrastructure/prisma-batched-mandates.reader.js";
import { PrismaCollectionTestRepository } from "./infrastructure/prisma-collection-test.repository.js";
import {
  PrismaCollectionTestFileReader,
  PrismaCollectionTestReturnTargetsReader,
  PrismaCollectionTestsReader,
} from "./infrastructure/prisma-collection-tests.reader.js";
import {
  PrismaEstablishmentCompaniesReader,
  PrismaOwnEstablishmentRepository,
  PrismaOwnEstablishmentsReader,
} from "./infrastructure/prisma-own-establishments.js";

/**
 * Le prélèvement d'essai et nos établissements (plan
 * `plan-prelevement-d-essai.md`). À part du module, qui dépasse déjà la taille
 * d'un fichier. Les mandats (`CollectionMandatesReader`) viennent de
 * `payments`, relié par `appBootstrap/debtor-mandate.module.ts`.
 *
 * `CollectionTestReturnTargetsReader` et `CollectionTestRepository` servent
 * aussi l'import des retours (`COLLECTION_RETURN_PROVIDERS`).
 */
export const COLLECTION_TEST_PROVIDERS: readonly Provider[] = [
  { provide: OwnEstablishmentRepository, useClass: PrismaOwnEstablishmentRepository },
  { provide: OwnEstablishmentsReader, useClass: PrismaOwnEstablishmentsReader },
  { provide: EstablishmentCompaniesReader, useClass: PrismaEstablishmentCompaniesReader },
  { provide: BatchedMandatesReader, useClass: PrismaBatchedMandatesReader },
  { provide: CollectionTestRepository, useClass: PrismaCollectionTestRepository },
  { provide: CollectionTestsReader, useClass: PrismaCollectionTestsReader },
  { provide: CollectionTestFileReader, useClass: PrismaCollectionTestFileReader },
  { provide: CollectionTestReturnTargetsReader, useClass: PrismaCollectionTestReturnTargetsReader },
  DeclareOwnEstablishmentHandler,
  WithdrawOwnEstablishmentHandler,
  GenerateCollectionTestHandler,
  MarkCollectionTestRefundedHandler,
  ListOwnEstablishmentsHandler,
  GetCollectionTestDebtorsHandler,
  ListCollectionTestsHandler,
  ExportCollectionTestFileHandler,
  ExportCollectionTestMandateHandler,
];

export const COLLECTION_TEST_CONTROLLERS = [
  AdminOwnEstablishmentsController,
  AdminCollectionTestsController,
];

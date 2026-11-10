import type { Provider } from "@nestjs/common";

import { ConfirmCollectionReturnImportHandler } from "./application/commands/confirm-collection-return-import.handler.js";
import { RecordCollectionReturnHandler } from "./application/commands/record-collection-return.handler.js";
import { RepresentCollectionReturnHandler } from "./application/commands/represent-collection-return.handler.js";
import { SettleCollectionReturnHandler } from "./application/commands/settle-collection-return.handler.js";
import { WriteOffCollectionReturnHandler } from "./application/commands/write-off-collection-return.handler.js";
import { RingCollectionReturned } from "./application/handlers/ring-collection-returned.handler.js";
import { GetBatchCollectionReturnsHandler } from "./application/queries/get-batch-collection-returns.handler.js";
import { GetPayerCollectionReturnsHandler } from "./application/queries/get-payer-collection-returns.handler.js";
import { PreviewCollectionReturnImportHandler } from "./application/queries/preview-collection-return-import.handler.js";
import { CollectionReturnRepository } from "./domain/ports/collection-return.repository.js";
import { CollectionReturnsReader } from "./domain/ports/collection-returns.reader.js";
import { RepresentedRejectionsReader } from "./domain/ports/represented-rejections.reader.js";
import { ReturnableLinesReader } from "./domain/ports/returnable-lines.reader.js";
import { PrismaCollectionReturnRepository } from "./infrastructure/prisma-collection-return.repository.js";
import {
  PrismaCollectionReturnsReader,
  PrismaRepresentedRejectionsReader,
} from "./infrastructure/prisma-collection-returns.reader.js";
import { PrismaReturnableLinesReader } from "./infrastructure/prisma-returnable-lines.reader.js";

/**
 * Les providers des retours bancaires (plan `retours-bancaires.md`).
 * À part du module, qui dépasse déjà la taille d'un fichier. Le
 * relecteur des mandats (`MandateRecheckReader`) n'est pas ici : `payments`
 * l'implémente, et il est déjà relié pour le dépôt.
 */
export const COLLECTION_RETURN_PROVIDERS: readonly Provider[] = [
  { provide: CollectionReturnRepository, useClass: PrismaCollectionReturnRepository },
  { provide: CollectionReturnsReader, useClass: PrismaCollectionReturnsReader },
  { provide: ReturnableLinesReader, useClass: PrismaReturnableLinesReader },
  { provide: RepresentedRejectionsReader, useClass: PrismaRepresentedRejectionsReader },
  RecordCollectionReturnHandler,
  RepresentCollectionReturnHandler,
  SettleCollectionReturnHandler,
  WriteOffCollectionReturnHandler,
  ConfirmCollectionReturnImportHandler,
  GetBatchCollectionReturnsHandler,
  GetPayerCollectionReturnsHandler,
  PreviewCollectionReturnImportHandler,
  RingCollectionReturned,
];

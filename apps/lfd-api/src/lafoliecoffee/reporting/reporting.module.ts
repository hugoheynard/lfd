import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { AccountingModule } from "../accounting/accounting.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { IssueExportReaderKeyHandler } from "./application/commands/issue-export-reader-key.handler.js";
import { RevokeExportReaderKeyHandler } from "./application/commands/revoke-export-reader-key.handler.js";
import { GetSalesExportHandler } from "./application/queries/get-sales-export.handler.js";
import { ListExportReaderKeysHandler } from "./application/queries/list-export-reader-keys.handler.js";
import { ExportReaderAdmission } from "./application/services/export-reader-admission.js";
import { ExportKeySecretSource } from "./domain/ports/export-key-secret-source.js";
import { ExportReaderKeyLookup } from "./domain/ports/export-reader-key.lookup.js";
import { ExportReaderKeyReader } from "./domain/ports/export-reader-key.reader.js";
import { ExportReaderKeyRepository } from "./domain/ports/export-reader-key.repository.js";
import { AdminExportKeysController } from "./http/admin-export-keys.controller.js";
import { ExportReaderKeyGuard } from "./http/export-reader-key.guard.js";
import { PrismaExportReaderKeyLookup } from "./infrastructure/prisma-export-reader-key.lookup.js";
import { PrismaExportReaderKeyReader } from "./infrastructure/prisma-export-reader-key.reader.js";
import { PrismaExportReaderKeyRepository } from "./infrastructure/prisma-export-reader-key.repository.js";
import { RandomExportKeySecretSource } from "./infrastructure/random-export-key-secret-source.js";

/**
 * **Le reporting** — l'export des ventes pour la Direction
 * (`documentation/commandes/export/plan-export-des-ventes.md`). Il compose les
 * lectures que leurs propriétaires publient — commandes (`OrdersModule`),
 * avoirs (`AccountingModule`), familles (`CatalogModule`), sociétés
 * (`AccountModule`) — et l'argent rendu, lu par le canal de `payment` que
 * `CardPaymentModule` (global) fournit. Il ne possède qu'une table, la
 * sienne : les clés de lecture de l'export (`export_reader_key`) et la garde
 * qui les vérifie.
 */
@Module({
  imports: [OrdersModule, AccountingModule, CatalogModule, AccountModule],
  controllers: [AdminExportKeysController],
  providers: [
    GetSalesExportHandler,
    { provide: ExportReaderKeyRepository, useClass: PrismaExportReaderKeyRepository },
    { provide: ExportReaderKeyLookup, useClass: PrismaExportReaderKeyLookup },
    { provide: ExportReaderKeyReader, useClass: PrismaExportReaderKeyReader },
    { provide: ExportKeySecretSource, useClass: RandomExportKeySecretSource },
    IssueExportReaderKeyHandler,
    RevokeExportReaderKeyHandler,
    ListExportReaderKeysHandler,
    ExportReaderAdmission,
    ExportReaderKeyGuard,
  ],
})
export class ReportingModule {}

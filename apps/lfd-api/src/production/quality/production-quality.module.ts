import { Module } from "@nestjs/common";

import { ProductionDayModule } from "../day/production-day.module.js";
import { DepositQualityPhotoHandler } from "./application/commands/deposit-quality-photo.handler.js";
import { RenderQualityCheckHandler } from "./application/commands/render-quality-check.handler.js";
import { SetQualityControlSettingsHandler } from "./application/commands/set-quality-control-settings.handler.js";
import { SweepQualityUploadsHandler } from "./application/commands/sweep-quality-uploads.handler.js";
import { GetQualityBoardHandler } from "./application/queries/get-quality-board.handler.js";
import { GetQualityControlSettingsHandler } from "./application/queries/get-quality-control-settings.handler.js";
import { GetQualityPhotoHandler } from "./application/queries/get-quality-photo.handler.js";
import { ListQualityChecksHandler } from "./application/queries/list-quality-checks.handler.js";
import { CheckedQualityHoldsReader } from "./application/services/checked-quality-holds.reader.js";
import { ChannelQualityHeldOrdersReader } from "./application/services/channel-quality-held-orders.reader.js";
import { CheckedQualityLinesReader } from "./application/services/checked-quality-lines.reader.js";
import { QualityPhotoAttachment } from "./application/services/quality-photo-attachment.service.js";
import { SealedDayReading } from "./application/services/sealed-day-reading.service.js";
import { QualityCheckReader } from "./domain/ports/quality-check.reader.js";
import { QualityCheckRepository } from "./domain/ports/quality-check.repository.js";
import { QualityControlSettingsReader } from "./domain/ports/quality-control-settings.reader.js";
import { QualityControlSettingsRepository } from "./domain/ports/quality-control-settings.repository.js";
import { QualityLineStatusReader } from "./domain/ports/quality-line-status.reader.js";
import { QualityUploadRepository } from "./domain/ports/quality-upload.repository.js";
import { ProductionQualityController } from "./http/production-quality.controller.js";
import { QualityControlSettingsController } from "./http/quality-control-settings.controller.js";
import { QualityUploadSweepController } from "./http/quality-upload-sweep.controller.js";
import {
  PrismaQualityCheckReader,
  PrismaQualityCheckRepository,
} from "./infrastructure/prisma-quality-check.repository.js";
import { PrismaQualityControlSettingsReader } from "./infrastructure/prisma-quality-control-settings.reader.js";
import { PrismaQualityControlSettingsRepository } from "./infrastructure/prisma-quality-control-settings.repository.js";
import { PrismaQualityUploadRepository } from "./infrastructure/prisma-quality-upload.repository.js";

/**
 * **Le contrôle qualité du superviseur** (plan `le-controle-qualite.md`).
 *
 * Lire une journée et écrire un verdict sont deux ports (ISP), les dépôts un
 * troisième. Il exporte le port des pastilles que la fiche de l'atelier lit,
 * et les deux lecteurs que la racine de composition relie au retrait et au
 * colisage.
 */
@Module({
  imports: [ProductionDayModule],
  controllers: [
    ProductionQualityController,
    QualityControlSettingsController,
    QualityUploadSweepController,
  ],
  providers: [
    DepositQualityPhotoHandler,
    RenderQualityCheckHandler,
    SweepQualityUploadsHandler,
    GetQualityBoardHandler,
    ListQualityChecksHandler,
    GetQualityPhotoHandler,
    QualityPhotoAttachment,
    { provide: QualityCheckRepository, useClass: PrismaQualityCheckRepository },
    { provide: QualityCheckReader, useClass: PrismaQualityCheckReader },
    { provide: QualityLineStatusReader, useClass: CheckedQualityLinesReader },
    { provide: QualityUploadRepository, useClass: PrismaQualityUploadRepository },
    SetQualityControlSettingsHandler,
    GetQualityControlSettingsHandler,
    { provide: QualityControlSettingsReader, useClass: PrismaQualityControlSettingsReader },
    { provide: QualityControlSettingsRepository, useClass: PrismaQualityControlSettingsRepository },
    // Les bacs fermés seulement — l'état du jour et le contrôle qualité.
    SealedDayReading,
    // Publié pour le poste servi par le colisage ; relié par `PackingFeedModule`.
    ChannelQualityHeldOrdersReader,
    // La retenue au retrait ; reliée par `HandoverFeedModule`.
    CheckedQualityHoldsReader,
  ],
  exports: [
    // La fiche de l'atelier lit les pastilles.
    QualityLineStatusReader,
    // La retenue publiée au retrait (`channels/handover/`) et au colisage.
    QualityCheckReader,
    ChannelQualityHeldOrdersReader,
    CheckedQualityHoldsReader,
  ],
})
export class ProductionQualityModule {}

/**
 * Les fournisseurs que ce module exporte et que la racine de composition
 * (`appBootstrap/`) relie à un port d'un autre bloc : elle les prend ici,
 * jamais dans l'intérieur du métier.
 */
export { ChannelQualityHeldOrdersReader, CheckedQualityHoldsReader };

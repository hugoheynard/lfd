import { Module } from "@nestjs/common";

import { OrderInscriptionReader } from "../channels/commerce/order-inscription.reader.js";
import { PruneProductionDayChangesHandler } from "./application/commands/prune-production-day-changes.handler.js";
import { OnPackingReturned } from "./application/handlers/on-packing-returned.handler.js";
import { GetProductionDueThresholdsHandler } from "./application/queries/get-production-due-thresholds.handler.js";
import { DayInscribedOrderHeaderReader } from "./application/services/day-inscribed-order-header.reader.js";
import { DayPlannedDestinationsReader } from "./application/services/day-planned-destinations.reader.js";
import { ProductionDayVersionSource } from "./application/services/production-day-version.source.js";
import { ProductionOrderRevisionDesk } from "./application/services/production-order-revision.desk.js";
import { ProductionOrderWithdrawalDesk } from "./application/services/production-order-withdrawal.desk.js";
import { OrderRevisionNoticeLedger } from "./domain/ports/order-revision-notice.ledger.js";
import { OrderRevisionNoticesReader } from "./domain/ports/order-revision-notices.reader.js";
import { OrderWithdrawalLedger } from "./domain/ports/order-withdrawal.ledger.js";
import { OrderWithdrawalsReader } from "./domain/ports/order-withdrawals.reader.js";
import { ProductionBatchRepository } from "./domain/ports/production-batch.repository.js";
import { ProductionDayChangePruner } from "./domain/ports/production-day-change.pruner.js";
import { ProductionDayStatusReader } from "./domain/ports/production-day-status.reader.js";
import { ProductionDayVersionReader } from "./domain/ports/production-day-version.reader.js";
import { ProductionDayLock } from "./domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "./domain/ports/production-day.repository.js";
import { ProductionHandoffLedger } from "./domain/ports/production-handoff.ledger.js";
import { ProductionHandoffReader } from "./domain/ports/production-handoff.reader.js";
import { ProductionReturnRequests } from "./domain/ports/production-return.requests.js";
import { ProductionTrancheSettingsReader } from "./domain/ports/production-tranche-settings.reader.js";
import { ProductionTrancheSettingsRepository } from "./domain/ports/production-tranche-settings.repository.js";
import { ProductionDayChangeSweepController } from "./http/production-day-change-sweep.controller.js";
import { PrismaOrderInscriptionReader } from "./infrastructure/prisma-order-inscription.reader.js";
import { PrismaOrderRevisionNoticeLedger } from "./infrastructure/prisma-order-revision-notice.ledger.js";
import { PrismaOrderRevisionNoticesReader } from "./infrastructure/prisma-order-revision-notices.reader.js";
import { PrismaOrderWithdrawalLedger } from "./infrastructure/prisma-order-withdrawal.ledger.js";
import { PrismaOrderWithdrawalsReader } from "./infrastructure/prisma-order-withdrawals.reader.js";
import { PrismaProductionBatchRepository } from "./infrastructure/prisma-production-batch.repository.js";
import { PrismaProductionDayChangePruner } from "./infrastructure/prisma-production-day-change.pruner.js";
import { PrismaProductionDayStatusReader } from "./infrastructure/prisma-production-day-status.reader.js";
import { PrismaProductionDayVersionReader } from "./infrastructure/prisma-production-day-version.reader.js";
import { PrismaProductionDayLock } from "./infrastructure/prisma-production-day.lock.js";
import { PrismaProductionDayRepository } from "./infrastructure/prisma-production-day.repository.js";
import { PrismaProductionHandoffLedger } from "./infrastructure/prisma-production-handoff.ledger.js";
import { PrismaProductionHandoffReader } from "./infrastructure/prisma-production-handoff.reader.js";
import { PrismaProductionReturnRequests } from "./infrastructure/prisma-production-return.requests.js";
import { PrismaProductionTrancheSettingsReader } from "./infrastructure/prisma-production-tranche-settings.reader.js";
import { PrismaProductionTrancheSettingsRepository } from "./infrastructure/prisma-production-tranche-settings.repository.js";

/**
 * **La journée du fournil** — le noyau, et le seul module que les métiers
 * importent (plan `documentation/fournil/plan-decoupage-du-fournil.md`, § 1 bis).
 *
 * Il exporte deux choses, et rien d'autre : ce que les métiers injectent du
 * noyau (dépôt, verrou, fournées, état, tranches, retraits, remises), et les
 * guichets et lecteurs que la racine de composition relie aux autres blocs.
 * Il n'importe aucun métier : un métier qui a besoin de la journée l'importe,
 * jamais l'inverse.
 */
@Module({
  controllers: [ProductionDayChangeSweepController],
  providers: [
    { provide: ProductionDayRepository, useClass: PrismaProductionDayRepository },
    { provide: ProductionBatchRepository, useClass: PrismaProductionBatchRepository },
    { provide: ProductionDayLock, useClass: PrismaProductionDayLock },
    // L'en-tête seul : une lecture ciblée, à part du dépôt qui relit la journée entière (ISP).
    { provide: ProductionDayStatusReader, useClass: PrismaProductionDayStatusReader },
    { provide: ProductionTrancheSettingsReader, useClass: PrismaProductionTrancheSettingsReader },
    {
      provide: ProductionTrancheSettingsRepository,
      useClass: PrismaProductionTrancheSettingsRepository,
    },
    GetProductionDueThresholdsHandler,
    // La version par journée : lire et balayer le journal sont deux ports (ISP).
    ProductionDayVersionSource,
    PruneProductionDayChangesHandler,
    { provide: ProductionDayVersionReader, useClass: PrismaProductionDayVersionReader },
    { provide: ProductionDayChangePruner, useClass: PrismaProductionDayChangePruner },
    // La remise au colisage, les retours demandés, et sa réponse.
    { provide: ProductionHandoffLedger, useClass: PrismaProductionHandoffLedger },
    { provide: ProductionHandoffReader, useClass: PrismaProductionHandoffReader },
    { provide: ProductionReturnRequests, useClass: PrismaProductionReturnRequests },
    OnPackingReturned,
    // L'annulation staff : le registre des retraits, lu sous le verrou, et le
    // guichet que le commerce appelle — relié par `ProductionDeskFeedModule`.
    { provide: OrderWithdrawalLedger, useClass: PrismaOrderWithdrawalLedger },
    { provide: OrderWithdrawalsReader, useClass: PrismaOrderWithdrawalsReader },
    PrismaOrderInscriptionReader,
    { provide: OrderInscriptionReader, useExisting: PrismaOrderInscriptionReader },
    ProductionOrderWithdrawalDesk,
    // La modification d'une commande : les notes de révision, écrites par le guichet sous le verrou.
    { provide: OrderRevisionNoticeLedger, useClass: PrismaOrderRevisionNoticeLedger },
    { provide: OrderRevisionNoticesReader, useClass: PrismaOrderRevisionNoticesReader },
    ProductionOrderRevisionDesk,
    // Publiés pour le colisage et la pierre tombale ; reliés par `PackingFeedModule`.
    DayPlannedDestinationsReader,
    DayInscribedOrderHeaderReader,
  ],
  exports: [
    // Ce que les métiers injectent du noyau.
    ProductionDayRepository,
    ProductionBatchRepository,
    ProductionDayLock,
    ProductionDayStatusReader,
    ProductionTrancheSettingsReader,
    ProductionTrancheSettingsRepository,
    OrderWithdrawalsReader,
    ProductionHandoffLedger,
    ProductionHandoffReader,
    ProductionReturnRequests,
    // Ce que la racine de composition relie aux autres blocs.
    ProductionDayVersionSource,
    DayPlannedDestinationsReader,
    ProductionOrderWithdrawalDesk,
    DayInscribedOrderHeaderReader,
    ProductionOrderRevisionDesk,
    PrismaOrderInscriptionReader,
  ],
})
export class ProductionDayModule {}

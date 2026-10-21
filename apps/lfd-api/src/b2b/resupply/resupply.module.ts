import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { OrderCutoffsInForceModule } from "../order-cutoffs/order-cutoffs-in-force.module.js";
import { AddSiteResupplyLineHandler } from "./application/add-site-resupply-line.handler.js";
import { CancelSiteResupplyHandler } from "./application/cancel-site-resupply.handler.js";
import { DeclareStockAlertHandler } from "./application/declare-stock-alert.handler.js";
import { LiftStockAlertHandler } from "./application/lift-stock-alert.handler.js";
import { ListLiveStockAlertsHandler } from "./application/list-live-stock-alerts.handler.js";
import { ListSiteStockAlertsHandler } from "./application/list-site-stock-alerts.handler.js";
import { CorrectReceivedResupplyLineHandler } from "./application/correct-received-resupply-line.handler.js";
import { CorrectResupplyLineHandler } from "./application/correct-resupply-line.handler.js";
import { CorrectSiteResupplyLineHandler } from "./application/correct-site-resupply-line.handler.js";
import { GetDayStockOverviewHandler } from "./application/get-day-stock-overview.handler.js";
import { GetResupplyProductionDayHandler } from "./application/get-resupply-production-day.handler.js";
import { GetResupplyReceiptHandler } from "./application/get-resupply-receipt.handler.js";
import { ListResuppliesToProduceHandler } from "./application/list-resupplies-to-produce.handler.js";
import { ListResupplyArticlesHandler } from "./application/list-resupply-articles.handler.js";
import { ListSiteResuppliesHandler } from "./application/list-site-resupplies.handler.js";
import { MarkArrivedOnTransferReceived } from "./application/mark-arrived-on-transfer-received.handler.js";
import { MarkResupplyMountedHandler } from "./application/mark-resupply-mounted.handler.js";
import { ResupplyArrivedBell } from "./application/resupply-arrived-bell.js";
import { ProductionDayResupplies } from "./application/production-day-resupplies.js";
import { ProductionRangeResupplies } from "./application/production-range-resupplies.js";
import { ResupplyPlanGate } from "./application/resupply-plan-gate.js";
import { ReceiveResupplyLineHandler } from "./application/receive-resupply-line.handler.js";
import { ReceiveSiteResupplyHandler } from "./application/receive-site-resupply.handler.js";
import { SendBakehouseResupplyHandler } from "./application/send-bakehouse-resupply.handler.js";
import { SendSiteResupplyHandler } from "./application/send-site-resupply.handler.js";
import { WithdrawResupplyLineHandler } from "./application/withdraw-resupply-line.handler.js";
import { WithdrawSiteResupplyLineHandler } from "./application/withdraw-site-resupply-line.handler.js";
import { DayStockReader } from "./domain/day-stock.reader.js";
import { ResupplyCatalogue } from "./domain/resupply-catalogue.js";
import { ResupplyCutoff } from "./domain/resupply-cutoff.js";
import { ResupplyReceptions } from "./domain/resupply-receptions.js";
import { ResupplyReceiptReader } from "./domain/resupply-receipt.reader.js";
import { ResupplyReceiptRepository } from "./domain/resupply-receipt.repository.js";
import { ResupplySiteLabels } from "./domain/resupply-site-labels.js";
import { ResupplySites } from "./domain/resupply-sites.js";
import { SiteResupplyReader } from "./domain/site-resupply.reader.js";
import { ResupplyUsedNames } from "./domain/resupply-used-names.js";
import { PrismaResupplyUsedNames } from "./infrastructure/prisma-resupply-used-names.js";
import { NameSiteResupplyHandler } from "./application/name-site-resupply.handler.js";
import { ListResupplyUsedNamesHandler } from "./application/list-resupply-used-names.handler.js";
import { SiteResupplyRepository } from "./domain/site-resupply.repository.js";
import { StockAlertReader } from "./domain/stock-alert.reader.js";
import { StockAlertRepository } from "./domain/stock-alert.repository.js";
import { TransferServedSites } from "./domain/transfer-served-sites.js";
import { AdminBakehouseResuppliesController } from "./http/admin-bakehouse-resupplies.controller.js";
import { AdminLiveStockAlertsController } from "./http/admin-live-stock-alerts.controller.js";
import { AdminSiteStockAlertsController } from "./http/admin-site-stock-alerts.controller.js";
import { AdminResuppliesToProduceController } from "./http/admin-resupplies-to-produce.controller.js";
import { AdminResupplyReceiptsController } from "./http/admin-resupply-receipts.controller.js";
import { AdminSiteResuppliesController } from "./http/admin-site-resupplies.controller.js";
import { AdminSupervisionStockController } from "./http/admin-supervision-stock.controller.js";
import { PrismaDayStockReader } from "./infrastructure/prisma-day-stock.reader.js";
import { CatalogResupplyCatalogue } from "./infrastructure/catalog-resupply-catalogue.js";
import { SettingsResupplyCutoff } from "./infrastructure/settings-resupply-cutoff.js";
import { PrismaResupplyReceptions } from "./infrastructure/prisma-resupply-receptions.js";
import { PrismaResupplySiteLabels } from "./infrastructure/prisma-resupply-site-labels.js";
import { PrismaResupplyReceiptReader } from "./infrastructure/prisma-resupply-receipt.reader.js";
import { PrismaResupplyReceiptRepository } from "./infrastructure/prisma-resupply-receipt.repository.js";
import { PrismaResupplySites } from "./infrastructure/prisma-resupply-sites.js";
import { PrismaSiteResupplyReader } from "./infrastructure/prisma-site-resupply.reader.js";
import { PrismaSiteResupplyRepository } from "./infrastructure/prisma-site-resupply.repository.js";
import { PrismaStockAlertReader } from "./infrastructure/prisma-stock-alert.reader.js";
import { PrismaStockAlertRepository } from "./infrastructure/prisma-stock-alert.repository.js";
import { PrismaTransferServedSites } from "./infrastructure/prisma-transfer-served-sites.js";

/**
 * **Le réapprovisionnement d'un site** (modèle B de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, Hugo
 * 2026-10-21) — la RÉCEPTION (ce que la vitrine a reçu, lot J1 du plan du
 * jour même ; un reçu par réassort depuis le lot R2) et, depuis le lot R1 (2026-10-21), la DEMANDE au fournil
 * (`SiteResupply`), que le fournil lit en lecture — sa demande en cours
 * enregistrée depuis R1c, et celle que le fournil envoie à part depuis R1d ;
 * et, depuis le lot R1b,
 * les alertes de stock du comptoir (`StockAlert`). Aucune dépendance au
 * modèle `Order`.
 *
 * `CatalogModule` pour le catalogue publié ; `AccountModule` pour le seul
 * `StaffDirectory` (l'auteur figé du geste) ; `OrderCutoffsInForceModule`
 * pour l'heure du réassort (lot R3a).
 *
 * Depuis le lot R3a (2026-10-21), l'envoi et l'annulation « pour demain »
 * passent par le guichet d'admission du plan (`ResupplyPlanGate`, ports du
 * fournil reliés par `ProductionDeskFeedModule`), et le module publie
 * `ProductionDayResupplies`, que `ProductionFeedModule` relie au port
 * `DayResuppliesReader` du fournil.
 *
 * Depuis le lot R3e (2026-10-22), le réassort ARRIVÉ : « Monté » au fournil,
 * ou la réception du transfert qui le porte (`MarkArrivedOnTransferReceived`,
 * abonné durable du fait `delivery.transfer_received`) ; la cloche sonne au
 * comptoir (`ResupplyArrivedBell`).
 *
 * Depuis le lot S1 (2026-10-22), l'onglet Stock de la Supervision
 * (`GetDayStockOverview`, sous `b2b_supervision`), en lecture seule.
 */
@Module({
  imports: [CatalogModule, AccountModule, OrderCutoffsInForceModule],
  controllers: [
    AdminResupplyReceiptsController,
    AdminSiteResuppliesController,
    AdminResuppliesToProduceController,
    AdminSiteStockAlertsController,
    AdminLiveStockAlertsController,
    AdminBakehouseResuppliesController,
    AdminSupervisionStockController,
  ],
  providers: [
    { provide: ResupplyReceiptRepository, useClass: PrismaResupplyReceiptRepository },
    { provide: ResupplyReceiptReader, useClass: PrismaResupplyReceiptReader },
    { provide: ResupplyReceptions, useClass: PrismaResupplyReceptions },
    { provide: ResupplyCatalogue, useClass: CatalogResupplyCatalogue },
    { provide: ResupplySites, useClass: PrismaResupplySites },
    { provide: SiteResupplyRepository, useClass: PrismaSiteResupplyRepository },
    { provide: SiteResupplyReader, useClass: PrismaSiteResupplyReader },
    { provide: ResupplyUsedNames, useClass: PrismaResupplyUsedNames },
    { provide: ResupplyCutoff, useClass: SettingsResupplyCutoff },
    { provide: ResupplySiteLabels, useClass: PrismaResupplySiteLabels },
    { provide: TransferServedSites, useClass: PrismaTransferServedSites },
    { provide: StockAlertRepository, useClass: PrismaStockAlertRepository },
    { provide: StockAlertReader, useClass: PrismaStockAlertReader },
    { provide: DayStockReader, useClass: PrismaDayStockReader },
    ReceiveResupplyLineHandler,
    CorrectResupplyLineHandler,
    WithdrawResupplyLineHandler,
    ReceiveSiteResupplyHandler,
    CorrectReceivedResupplyLineHandler,
    GetResupplyProductionDayHandler,
    GetResupplyReceiptHandler,
    GetDayStockOverviewHandler,
    ListResupplyArticlesHandler,
    SendBakehouseResupplyHandler,
    CancelSiteResupplyHandler,
    AddSiteResupplyLineHandler,
    CorrectSiteResupplyLineHandler,
    WithdrawSiteResupplyLineHandler,
    SendSiteResupplyHandler,
    NameSiteResupplyHandler,
    ListResupplyUsedNamesHandler,
    ListSiteResuppliesHandler,
    ListResuppliesToProduceHandler,
    DeclareStockAlertHandler,
    LiftStockAlertHandler,
    ListSiteStockAlertsHandler,
    ListLiveStockAlertsHandler,
    MarkResupplyMountedHandler,
    MarkArrivedOnTransferReceived,
    ResupplyArrivedBell,
    ResupplyPlanGate,
    ProductionDayResupplies,
    ProductionRangeResupplies,
  ],
  exports: [ProductionDayResupplies, ProductionRangeResupplies],
})
export class ResupplyModule {}

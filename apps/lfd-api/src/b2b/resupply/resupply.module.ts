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
import { GetResupplyReceiptHandler } from "./application/get-resupply-receipt.handler.js";
import { ListResuppliesToProduceHandler } from "./application/list-resupplies-to-produce.handler.js";
import { ListResupplyArticlesHandler } from "./application/list-resupply-articles.handler.js";
import { ListSiteResuppliesHandler } from "./application/list-site-resupplies.handler.js";
import { ReceiveResupplyLineHandler } from "./application/receive-resupply-line.handler.js";
import { ReceiveSiteResupplyHandler } from "./application/receive-site-resupply.handler.js";
import { SendBakehouseResupplyHandler } from "./application/send-bakehouse-resupply.handler.js";
import { SendSiteResupplyHandler } from "./application/send-site-resupply.handler.js";
import { WithdrawResupplyLineHandler } from "./application/withdraw-resupply-line.handler.js";
import { WithdrawSiteResupplyLineHandler } from "./application/withdraw-site-resupply-line.handler.js";
import { ResupplyCatalogue } from "./domain/resupply-catalogue.js";
import { ResupplyCutoff } from "./domain/resupply-cutoff.js";
import { ResupplyReceptions } from "./domain/resupply-receptions.js";
import { ResupplyReceiptReader } from "./domain/resupply-receipt.reader.js";
import { ResupplyReceiptRepository } from "./domain/resupply-receipt.repository.js";
import { ResupplySiteLabels } from "./domain/resupply-site-labels.js";
import { ResupplySites } from "./domain/resupply-sites.js";
import { SiteResupplyReader } from "./domain/site-resupply.reader.js";
import { SiteResupplyRepository } from "./domain/site-resupply.repository.js";
import { StockAlertReader } from "./domain/stock-alert.reader.js";
import { StockAlertRepository } from "./domain/stock-alert.repository.js";
import { AdminBakehouseResuppliesController } from "./http/admin-bakehouse-resupplies.controller.js";
import { AdminLiveStockAlertsController } from "./http/admin-live-stock-alerts.controller.js";
import { AdminSiteStockAlertsController } from "./http/admin-site-stock-alerts.controller.js";
import { AdminResuppliesToProduceController } from "./http/admin-resupplies-to-produce.controller.js";
import { AdminResupplyReceiptsController } from "./http/admin-resupply-receipts.controller.js";
import { AdminSiteResuppliesController } from "./http/admin-site-resupplies.controller.js";
import { CatalogResupplyCatalogue } from "./infrastructure/catalog-resupply-catalogue.js";
import { GeneralResupplyCutoff } from "./infrastructure/general-resupply-cutoff.js";
import { PrismaResupplyReceptions } from "./infrastructure/prisma-resupply-receptions.js";
import { PrismaResupplySiteLabels } from "./infrastructure/prisma-resupply-site-labels.js";
import { PrismaResupplyReceiptReader } from "./infrastructure/prisma-resupply-receipt.reader.js";
import { PrismaResupplyReceiptRepository } from "./infrastructure/prisma-resupply-receipt.repository.js";
import { PrismaResupplySites } from "./infrastructure/prisma-resupply-sites.js";
import { PrismaSiteResupplyReader } from "./infrastructure/prisma-site-resupply.reader.js";
import { PrismaSiteResupplyRepository } from "./infrastructure/prisma-site-resupply.repository.js";
import { PrismaStockAlertReader } from "./infrastructure/prisma-stock-alert.reader.js";
import { PrismaStockAlertRepository } from "./infrastructure/prisma-stock-alert.repository.js";

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
 * pour l'heure limite générale et le réglage « réassort soumis ».
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
  ],
  providers: [
    { provide: ResupplyReceiptRepository, useClass: PrismaResupplyReceiptRepository },
    { provide: ResupplyReceiptReader, useClass: PrismaResupplyReceiptReader },
    { provide: ResupplyReceptions, useClass: PrismaResupplyReceptions },
    { provide: ResupplyCatalogue, useClass: CatalogResupplyCatalogue },
    { provide: ResupplySites, useClass: PrismaResupplySites },
    { provide: SiteResupplyRepository, useClass: PrismaSiteResupplyRepository },
    { provide: SiteResupplyReader, useClass: PrismaSiteResupplyReader },
    { provide: ResupplyCutoff, useClass: GeneralResupplyCutoff },
    { provide: ResupplySiteLabels, useClass: PrismaResupplySiteLabels },
    { provide: StockAlertRepository, useClass: PrismaStockAlertRepository },
    { provide: StockAlertReader, useClass: PrismaStockAlertReader },
    ReceiveResupplyLineHandler,
    CorrectResupplyLineHandler,
    WithdrawResupplyLineHandler,
    ReceiveSiteResupplyHandler,
    CorrectReceivedResupplyLineHandler,
    GetResupplyReceiptHandler,
    ListResupplyArticlesHandler,
    SendBakehouseResupplyHandler,
    CancelSiteResupplyHandler,
    AddSiteResupplyLineHandler,
    CorrectSiteResupplyLineHandler,
    WithdrawSiteResupplyLineHandler,
    SendSiteResupplyHandler,
    ListSiteResuppliesHandler,
    ListResuppliesToProduceHandler,
    DeclareStockAlertHandler,
    LiftStockAlertHandler,
    ListSiteStockAlertsHandler,
    ListLiveStockAlertsHandler,
  ],
})
export class ResupplyModule {}

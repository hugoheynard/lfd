import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { OrderCutoffsInForceModule } from "../order-cutoffs/order-cutoffs-in-force.module.js";
import { CancelSiteResupplyHandler } from "./application/cancel-site-resupply.handler.js";
import { CorrectResupplyLineHandler } from "./application/correct-resupply-line.handler.js";
import { GetResupplyReceiptHandler } from "./application/get-resupply-receipt.handler.js";
import { ListResuppliesToProduceHandler } from "./application/list-resupplies-to-produce.handler.js";
import { ListResupplyArticlesHandler } from "./application/list-resupply-articles.handler.js";
import { ListSiteResuppliesHandler } from "./application/list-site-resupplies.handler.js";
import { PlaceSiteResupplyHandler } from "./application/place-site-resupply.handler.js";
import { ReceiveResupplyLineHandler } from "./application/receive-resupply-line.handler.js";
import { WithdrawResupplyLineHandler } from "./application/withdraw-resupply-line.handler.js";
import { ResupplyCatalogue } from "./domain/resupply-catalogue.js";
import { ResupplyCutoff } from "./domain/resupply-cutoff.js";
import { ResupplyReceiptRepository } from "./domain/resupply-receipt.repository.js";
import { ResupplySiteLabels } from "./domain/resupply-site-labels.js";
import { ResupplySites } from "./domain/resupply-sites.js";
import { SiteResupplyReader } from "./domain/site-resupply.reader.js";
import { SiteResupplyRepository } from "./domain/site-resupply.repository.js";
import { AdminResuppliesToProduceController } from "./http/admin-resupplies-to-produce.controller.js";
import { AdminResupplyReceiptsController } from "./http/admin-resupply-receipts.controller.js";
import { AdminSiteResuppliesController } from "./http/admin-site-resupplies.controller.js";
import { CatalogResupplyCatalogue } from "./infrastructure/catalog-resupply-catalogue.js";
import { GeneralResupplyCutoff } from "./infrastructure/general-resupply-cutoff.js";
import { PrismaResupplySiteLabels } from "./infrastructure/prisma-resupply-site-labels.js";
import { PrismaResupplyReceiptRepository } from "./infrastructure/prisma-resupply-receipt.repository.js";
import { PrismaResupplySites } from "./infrastructure/prisma-resupply-sites.js";
import { PrismaSiteResupplyReader } from "./infrastructure/prisma-site-resupply.reader.js";
import { PrismaSiteResupplyRepository } from "./infrastructure/prisma-site-resupply.repository.js";

/**
 * **Le réapprovisionnement d'un site** (modèle B de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, Hugo
 * 2026-10-21) — la RÉCEPTION (ce que la vitrine a reçu, lot J1 du plan du
 * jour même) et, depuis le lot R1 (2026-10-21), la DEMANDE au fournil
 * (`SiteResupply`), que le fournil lit en lecture. Aucune dépendance au
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
  ],
  providers: [
    { provide: ResupplyReceiptRepository, useClass: PrismaResupplyReceiptRepository },
    { provide: ResupplyCatalogue, useClass: CatalogResupplyCatalogue },
    { provide: ResupplySites, useClass: PrismaResupplySites },
    { provide: SiteResupplyRepository, useClass: PrismaSiteResupplyRepository },
    { provide: SiteResupplyReader, useClass: PrismaSiteResupplyReader },
    { provide: ResupplyCutoff, useClass: GeneralResupplyCutoff },
    { provide: ResupplySiteLabels, useClass: PrismaResupplySiteLabels },
    ReceiveResupplyLineHandler,
    CorrectResupplyLineHandler,
    WithdrawResupplyLineHandler,
    GetResupplyReceiptHandler,
    ListResupplyArticlesHandler,
    PlaceSiteResupplyHandler,
    CancelSiteResupplyHandler,
    ListSiteResuppliesHandler,
    ListResuppliesToProduceHandler,
  ],
})
export class ResupplyModule {}

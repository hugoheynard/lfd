import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { CorrectResupplyLineHandler } from "./application/correct-resupply-line.handler.js";
import { GetResupplyReceiptHandler } from "./application/get-resupply-receipt.handler.js";
import { ListResupplyArticlesHandler } from "./application/list-resupply-articles.handler.js";
import { ReceiveResupplyLineHandler } from "./application/receive-resupply-line.handler.js";
import { WithdrawResupplyLineHandler } from "./application/withdraw-resupply-line.handler.js";
import { ResupplyCatalogue } from "./domain/resupply-catalogue.js";
import { ResupplyReceiptRepository } from "./domain/resupply-receipt.repository.js";
import { ResupplySites } from "./domain/resupply-sites.js";
import { AdminResupplyReceiptsController } from "./http/admin-resupply-receipts.controller.js";
import { CatalogResupplyCatalogue } from "./infrastructure/catalog-resupply-catalogue.js";
import { PrismaResupplyReceiptRepository } from "./infrastructure/prisma-resupply-receipt.repository.js";
import { PrismaResupplySites } from "./infrastructure/prisma-resupply-sites.js";

/**
 * **Le réapprovisionnement d'un site** (modèle B de
 * `documentation/livraisons/transferts/plan-reapprovisionnement.md`, Hugo
 * 2026-10-21) — pour l'instant sa seule RÉCEPTION : ce que la vitrine a reçu,
 * saisi au comptoir (lot J1 du plan du jour même). La demande au fournil
 * (`SiteResupply`) viendra ici, à côté. Aucune dépendance au modèle `Order`.
 *
 * `CatalogModule` pour le catalogue publié ; `AccountModule` pour le seul
 * `StaffDirectory` (l'auteur figé du geste).
 */
@Module({
  imports: [CatalogModule, AccountModule],
  controllers: [AdminResupplyReceiptsController],
  providers: [
    { provide: ResupplyReceiptRepository, useClass: PrismaResupplyReceiptRepository },
    { provide: ResupplyCatalogue, useClass: CatalogResupplyCatalogue },
    { provide: ResupplySites, useClass: PrismaResupplySites },
    ReceiveResupplyLineHandler,
    CorrectResupplyLineHandler,
    WithdrawResupplyLineHandler,
    GetResupplyReceiptHandler,
    ListResupplyArticlesHandler,
  ],
})
export class ResupplyModule {}

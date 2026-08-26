import { Logger, Module, type OnModuleInit } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { PimIdGenerator, UuidV7Generator } from "../infra/id/pim-id-generator.js";
import { StartupReport } from "../../platform/startup/startup-report.service.js";
import { CloseShopHandler } from "./application/close-shop.js";
import { GenerateTableQrHandler } from "./application/generate-table-qr.js";
import { ListPointsOfSaleHandler } from "./application/list-points-of-sale.js";
import { OpenPointOfSaleHandler } from "./application/open-point-of-sale.js";
import { RemoveTableQrHandler } from "./application/remove-table-qr.js";
import { UpdatePointOfSaleHandler } from "./application/update-point-of-sale.js";
import { PointOfSaleReader } from "./domain/ports/point-of-sale.reader.js";
import { PointOfSaleRepository } from "./domain/ports/point-of-sale.repository.js";
import { PointOfSaleUsageReader } from "./domain/ports/point-of-sale-usage.reader.js";
import { TableTokenGenerator } from "./domain/ports/table-token-generator.js";
import { PointOfSaleController } from "./http/point-of-sale.controller.js";
import { PrismaPointOfSaleReader } from "./infrastructure/prisma-point-of-sale.reader.js";
import { PrismaPointOfSaleRepository } from "./infrastructure/prisma-point-of-sale.repository.js";
import { PrismaPointOfSaleUsageReader } from "./infrastructure/prisma-point-of-sale-usage.reader.js";
import { UuidTableTokenGenerator } from "./infrastructure/uuid-table-token-generator.js";

/**
 * Contexte **points-of-sale** — d'où l'on vend : boutiques et plateformes, leur
 * offre de contextes et leur grille de tables. Modèle **CQRS** (un handler par
 * cas). Aucune dépendance au catalogue : un point de vente ne connaît ni produit
 * ni famille.
 *
 * Il remplace le contexte `locations`, dont il était le cas particulier
 * « boutique » (`documentation/pim/point-de-vente.md`).
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [PointOfSaleController],
  providers: [
    OpenPointOfSaleHandler,
    UpdatePointOfSaleHandler,
    CloseShopHandler,
    GenerateTableQrHandler,
    RemoveTableQrHandler,
    ListPointsOfSaleHandler,
    { provide: PimIdGenerator, useClass: UuidV7Generator },
    { provide: TableTokenGenerator, useClass: UuidTableTokenGenerator },
    { provide: PointOfSaleRepository, useClass: PrismaPointOfSaleRepository },
    { provide: PointOfSaleReader, useClass: PrismaPointOfSaleReader },
    { provide: PointOfSaleUsageReader, useClass: PrismaPointOfSaleUsageReader },
  ],
})
export class PointsOfSaleModule implements OnModuleInit {
  private readonly logger = new Logger(PointsOfSaleModule.name);

  constructor(
    private readonly points: PointOfSaleReader,
    private readonly startup: StartupReport,
  ) {}

  /**
   * Garantit la **plateforme professionnelle** au démarrage — même contrat, et
   * même raison, que le contexte de vente racine : sans elle, la matrice B2B
   * n'a plus de cible et la boutique pro se vide **sans qu'une erreur soit
   * levée**.
   *
   * Le boot n'est pas bloqué : le démarrage suivant réessaiera, et un souci
   * transitoire de base ne doit pas tuer l'API. Mais la cause la plus fréquente
   * — une migration non appliquée — se manifesterait sinon par un catalogue B2B
   * vide, ce qui n'oriente vers rien.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.points.ensureRootPointOfSale();
    } catch (error) {
      this.logger.error("ensureRootPointOfSale a échoué", error);
      this.startup.report({
        capability: "Point de vente racine (plateforme B2B)",
        setting: "—",
        consequence:
          "la plateforme professionnelle n'a pas pu être semée — cause la plus fréquente : " +
          "une migration non appliquée. Symptôme visible : la boutique professionnelle se vide",
        severity: "blocking",
      });
    }
  }
}

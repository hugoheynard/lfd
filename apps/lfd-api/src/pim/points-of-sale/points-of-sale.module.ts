import { Logger, Module, type OnModuleInit } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { StartupReport } from "../../platform/startup/startup-report.service.js";
import { ListPointsOfSaleHandler } from "./application/list-points-of-sale.js";
import { PointOfSaleReader } from "./domain/ports/point-of-sale.reader.js";
import { PointOfSaleController } from "./http/point-of-sale.controller.js";
import { PrismaPointOfSaleReader } from "./infrastructure/prisma-point-of-sale.reader.js";

/**
 * Contexte **points-of-sale** — d'où l'on vend. Boutiques et plateformes dans
 * une seule liste, là où le modèle ne connaissait que les premières et laissait
 * la seconde s'écrire `NULL`.
 *
 * **Lecture seule** en p-0 (`documentation/pim/point-de-vente.md`) : les
 * boutiques restent écrites par `LocationsModule`, qui tient ce miroir dans la
 * même transaction que sa source. Deux portes d'écriture feraient deux vérités
 * le temps de la bascule.
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [PointOfSaleController],
  providers: [
    ListPointsOfSaleHandler,
    { provide: PointOfSaleReader, useClass: PrismaPointOfSaleReader },
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

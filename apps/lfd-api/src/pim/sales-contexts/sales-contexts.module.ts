import { Logger, Module, type OnModuleInit } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { StartupReport } from "../../platform/startup/startup-report.service.js";
import { CreateSalesContextHandler } from "./application/create-sales-context.js";
import { RemoveSalesContextHandler } from "./application/remove-sales-context.js";
import { UpdateSalesContextHandler } from "./application/update-sales-context.js";
import { SalesContextRegistry } from "./domain/ports/sales-context.registry.js";
import { SalesContextRepository } from "./domain/ports/sales-context.repository.js";
import { SalesContextController } from "./http/sales-context.controller.js";
import { PrismaSalesContextRegistry } from "./infrastructure/prisma-sales-context.registry.js";
import { PrismaSalesContextRepository } from "./infrastructure/prisma-sales-context.repository.js";

/**
 * Contexte **sales-contexts** — le registre des manières de vendre.
 *
 * ## Pourquoi il n'est plus dans `catalogue/shared/`
 *
 * Il y est né, et à l'époque c'était juste : une table de correspondance que le
 * catalogue lisait pour poser sa TVA, « partagée » entre `category/` et
 * `product/`.
 *
 * Il a grandi. C0-d lui a donné un agrégat, des invariants (clé immuable,
 * racine ineffaçable), un écran et du CRUD ; le point de vente lui a donné un
 * second citant. Trois de ses quatre consommateurs vivaient dès lors HORS du
 * catalogue — les points de vente, et les deux canaux de sortie — et deux
 * symptômes le disaient :
 *
 * - `CatalogueModule` devait **ré-exporter** le registre, avec un commentaire
 *   qui l'avouait (« le registre sort AVEC le lecteur : les canaux itèrent les
 *   contextes ») ;
 * - `points-of-sale` allait chercher `ROOT_CONTEXT_KEY` par un chemin relatif
 *   **dans les entrailles** d'un voisin — le seul import de ce genre du
 *   référentiel.
 *
 * C'est un référentiel, comme les taux de TVA (`commerce/`) et les points de
 * vente. Il est donc leur frère.
 *
 * Il **exporte** le registre : le catalogue le lit pour ses taux et sa matrice,
 * les canaux l'itèrent pour savoir ce qu'ils projettent. Le dépôt d'écriture,
 * lui, ne sort pas — on règle un contexte par cet écran, pas d'ailleurs.
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [SalesContextController],
  providers: [
    CreateSalesContextHandler,
    UpdateSalesContextHandler,
    RemoveSalesContextHandler,
    { provide: SalesContextRegistry, useClass: PrismaSalesContextRegistry },
    { provide: SalesContextRepository, useClass: PrismaSalesContextRepository },
  ],
  exports: [SalesContextRegistry],
})
export class SalesContextsModule implements OnModuleInit {
  private readonly logger = new Logger(SalesContextsModule.name);

  constructor(
    private readonly contexts: SalesContextRegistry,
    private readonly startup: StartupReport,
  ) {}

  /**
   * Garantit le contexte de vente **racine** au démarrage.
   *
   * Même contrat, et même raison, que l'admin racine : sans le contexte B2B,
   * aucune TVA professionnelle ne se règle et la boutique pro se vide — **sans
   * qu'une seule erreur soit levée**. Une panne silencieuse mérite une garde au
   * boot ; une panne bruyante peut attendre qu'on la lise.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.contexts.ensureRootContext();
    } catch (error) {
      // On ne bloque PAS le boot : le prochain démarrage réessaiera, et un
      // souci transitoire de base ne doit pas tuer l'API. Mais on ne le garde
      // pas pour nous : sans ce rapport, la cause la plus fréquente — une
      // migration non appliquée — se manifesterait par un catalogue B2B vide,
      // ce qui n'oriente vers rien.
      this.logger.error("ensureRootContext a échoué", error);
      this.startup.report({
        capability: "Contexte de vente racine (B2B)",
        setting: "—",
        consequence:
          "le contexte B2B n'a pas pu être semé — cause la plus fréquente : une migration " +
          "non appliquée. Symptôme visible : la boutique professionnelle se vide",
        severity: "blocking",
      });
    }
  }
}

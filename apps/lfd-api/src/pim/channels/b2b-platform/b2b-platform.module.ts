import { Module } from "@nestjs/common";

import { AccountingRulesModule } from "../../accounting-rules/accounting-rules.module.js";
import { AllergensModule } from "../../allergens/allergens.module.js";
import { CatalogueModule } from "../../catalogue/catalogue.module.js";
import { OrderTimeLimitationModule } from "../../order-time-limitation/order-time-limitation.module.js";
import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { ReemitCatalogHandler } from "./application/reemit-catalog.js";
import { B2bReemitController } from "./products/reemit.controller.js";

/**
 * Adaptateur du canal **plateforme B2B** — le second canal, après l'ancien canal de vente en ligne.
 *
 * Même règle qu'ailleurs (ADR-13) : il **dépend** du catalogue, jamais l'inverse.
 * Supprimer ce module ne casserait rien en amont ; c'est le test qui dit que la
 * frontière tient.
 *
 * Il ne porte plus que la **réémission** des faits du catalogue. Partis en X4
 * (`documentation/catalogue/catalogue-synchronise.md` §6) : l'appartenance au
 * canal par fiche, la bascule vers l'audience qui la lisait, et le port des
 * opérations que le commerce lisait pour les reprendre.
 *
 * Préfixe monté par `AppModule` via `RouterModule` (`channels/b2b`) : les
 * contrôleurs ne déclarent que leur sous-chemin.
 */
@Module({
  imports: [
    OrderTimeLimitationModule,
    PimDatabaseModule,
    CatalogueModule,
    AccountingRulesModule,
    AllergensModule,
  ],
  controllers: [B2bReemitController],
  providers: [ReemitCatalogHandler],
})
export class B2bPlatformModule {}

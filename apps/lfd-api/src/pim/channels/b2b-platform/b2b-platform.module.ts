import { Module } from "@nestjs/common";

import { AccountingRulesModule } from "../../accounting-rules/accounting-rules.module.js";
import { AllergensModule } from "../../allergens/allergens.module.js";
import { CatalogueModule } from "../../catalogue/catalogue.module.js";
import { OrderTimeLimitationModule } from "../../order-time-limitation/order-time-limitation.module.js";
import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { OperationsModule } from "../../operations/operations.module.js";
import { ReemitCatalogHandler } from "./application/reemit-catalog.js";
import { B2bReemitController } from "./products/reemit.controller.js";
import { B2bMembershipController } from "./membership/membership.controller.js";
import { AudienceSwitchPreviewController } from "./membership/audience-switch-preview.controller.js";
import { GetAudienceSwitchPreviewHandler } from "./application/audience-switch-preview.js";
import { ApplyAudienceSwitchHandler } from "./application/apply-audience-switch.js";
import { AudienceSwitchController } from "./membership/audience-switch.controller.js";
import { SalesContextsModule } from "../../sales-contexts/sales-contexts.module.js";
import { B2bMembershipService } from "./membership/membership.service.js";
import { GetB2bProductDeliveryHandler } from "./products/product-delivery.js";
import { B2bProductDeliveryController } from "./products/product-delivery.controller.js";
import { PimReferentialOperations } from "./operations/pim-referential-operations.js";
import { ReferentialOperations } from "./operations/referential-operations.js";

/**
 * Adaptateur du canal **plateforme B2B** — le second canal, après l'ancien canal de vente en ligne.
 *
 * Même règle qu'ailleurs (ADR-13) : il **dépend** du catalogue, jamais l'inverse.
 * Supprimer ce module ne casserait rien en amont ; c'est le test qui dit que la
 * frontière tient.
 *
 * Un canal de plus est un module de plus, pas une branche de plus dans le canal
 * existant — c'est ce que l'OCP demande, et c'est ce qui permettait à l'ancien canal de vente en ligne
 * et au B2B de diverger sans se gêner.
 *
 * Préfixe monté par `AppModule` via `RouterModule` (`channels/b2b`) : les
 * contrôleurs ne déclarent que leur sous-chemin.
 */
@Module({
  // `AllergensModule` fournit le lecteur du référentiel : la projection y prend
  // les mentions d'étiquette une fois par push (D6), parce que le récepteur n'a
  // plus de quoi les fabriquer.
  imports: [
    OrderTimeLimitationModule,
    PimDatabaseModule,
    CatalogueModule,
    AccountingRulesModule,
    AllergensModule,
    // Le port de LECTURE des opérations datées, projetées dans le fil v11.
    OperationsModule,
    // Les contextes en service : l'aperçu de bascule juge la complétude (2b).
    SalesContextsModule,
  ],
  controllers: [
    B2bMembershipController,
    B2bProductDeliveryController,
    AudienceSwitchPreviewController,
    AudienceSwitchController,
    B2bReemitController,
  ],
  providers: [
    B2bMembershipService,
    ReemitCatalogHandler,
    // L'aperçu de la bascule vers l'audience (lot 1, 1f) : lecture seule.
    GetAudienceSwitchPreviewHandler,
    // Son second temps (2b1) : désactive ce que l'aperçu liste invisible (H7).
    ApplyAudienceSwitchHandler,
    // La frise. Son port de RETOUR (`B2bDeliveryFactsReader`) n'est pas fourni
    // ici : il est publié par ce module et relié par la racine de composition,
    // seule à connaître les deux côtés du fil.
    GetB2bProductDeliveryHandler,
    // La migration des opérations au commerce (lot 3 du plan
    // `plan-l-operation-passe-au-commerce.md`) : lecture seule, une fois.
    { provide: ReferentialOperations, useClass: PimReferentialOperations },
  ],
  exports: [B2bMembershipService, ReferentialOperations],
})
export class B2bPlatformModule {}

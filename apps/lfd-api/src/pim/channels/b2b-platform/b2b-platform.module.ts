import { Module } from "@nestjs/common";

import { AccountingRulesModule } from "../../accounting-rules/accounting-rules.module.js";
import { AllergensModule } from "../../allergens/allergens.module.js";
import { CatalogueModule } from "../../catalogue/catalogue.module.js";
import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { PushB2bCatalogHandler } from "./application/push-b2b-catalog.js";
import { B2bMembershipController } from "./membership/membership.controller.js";
import { B2bMembershipService } from "./membership/membership.service.js";
import { DryRunB2bCatalogDriver } from "./products/driver.js";
import { B2bCatalogFeedPreview } from "./products/feed-preview.js";
import { B2bCatalogFeedProjection } from "./products/feed-projection.service.js";
import { GetB2bProductDeliveryHandler } from "./products/product-delivery.js";
import { B2bProductDeliveryController } from "./products/product-delivery.controller.js";
import { B2bPushController } from "./products/push.controller.js";
import { B2bCatalogPushService } from "./products/push.service.js";

/**
 * Adaptateur du canal **plateforme B2B** — le second canal, après Shopify.
 *
 * Même règle qu'ailleurs (ADR-13) : il **dépend** du catalogue, jamais l'inverse.
 * Supprimer ce module ne casserait rien en amont ; c'est le test qui dit que la
 * frontière tient.
 *
 * Un canal de plus est un module de plus, pas une branche de plus dans le canal
 * existant — c'est ce que l'OCP demande, et c'est ce qui permettra à Shopify et
 * au B2B de diverger sans se gêner.
 *
 * Préfixe monté par `AppModule` via `RouterModule` (`channels/b2b`) : les
 * contrôleurs ne déclarent que leur sous-chemin.
 */
@Module({
  // `AllergensModule` fournit le lecteur du référentiel : la projection y prend
  // les mentions d'étiquette une fois par push (D6), parce que le récepteur n'a
  // plus de quoi les fabriquer.
  imports: [PimDatabaseModule, CatalogueModule, AccountingRulesModule, AllergensModule],
  controllers: [B2bMembershipController, B2bPushController, B2bProductDeliveryController],
  providers: [
    B2bMembershipService,
    B2bCatalogPushService,
    PushB2bCatalogHandler,
    // La frise. Son port de RETOUR (`B2bDeliveryFactsReader`) n'est pas fourni
    // ici : il est publié par ce module et relié par la racine de composition,
    // seule à connaître les deux côtés du fil.
    GetB2bProductDeliveryHandler,
    // La simulation est fournie ici ; l'envoi réel (`B2bCatalogDriver`) est
    // relié par la racine de composition, seule à connaître les deux côtés.
    DryRunB2bCatalogDriver,
    { provide: B2bCatalogFeedPreview, useClass: B2bCatalogFeedProjection },
  ],
  // Le port de LECTURE sort d'ici : la plateforme s'en sert pour vérifier que
  // son miroir n'a pas dérivé de sa source. Le port d'écriture, lui, ne sort
  // pas — publier reste une décision du référentiel.
  exports: [B2bMembershipService, B2bCatalogFeedPreview],
})
export class B2bPlatformModule {}

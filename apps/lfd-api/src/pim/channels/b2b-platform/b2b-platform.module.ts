import { Module } from "@nestjs/common";

import { CatalogueModule } from "../../catalogue/catalogue.module.js";
import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { B2bMembershipController } from "./membership/membership.controller.js";
import { B2bMembershipService } from "./membership/membership.service.js";
import { DryRunB2bCatalogDriver } from "./products/driver.js";
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
  imports: [PimDatabaseModule, CatalogueModule],
  controllers: [B2bMembershipController, B2bPushController],
  providers: [
    B2bMembershipService,
    B2bCatalogPushService,
    // La simulation est fournie ici ; l'envoi réel (`B2bCatalogDriver`) est
    // relié par la racine de composition, seule à connaître les deux côtés.
    DryRunB2bCatalogDriver,
  ],
  exports: [B2bMembershipService],
})
export class B2bPlatformModule {}

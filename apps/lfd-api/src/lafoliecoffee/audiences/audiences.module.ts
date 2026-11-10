import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { GetAudiencesHandler } from "./application/queries/get-audiences.handler.js";
import { AudienceFamilyReader } from "./domain/ports/audience-family.reader.js";
import { AdminAudiencesController } from "./http/admin-audiences.controller.js";
import { CatalogAudienceFamilyReader } from "./infrastructure/catalog-audience-family.reader.js";

/**
 * **Les audiences de la clientèle** — lot A1 de
 * `documentation/recommandation-produit/plan-audiences.md` : un tableau de
 * bord agrégé des segments sûrs, au back-office.
 *
 * Un contexte à lui plutôt qu'un coin de `recommendations` : décrire la
 * clientèle n'est pas recommander, et les deux changeront pour des raisons
 * différentes. Les suggestions par segment (A4) liront d'ici, par un port.
 *
 * Lit les commandes par `AudienceOrderReader` (déclaré ici, implémenté et
 * exporté par `OrdersModule`) et les familles au catalogue (`CatalogModule`).
 * N'écrit rien, ne stocke aucun segment.
 */
@Module({
  imports: [CatalogModule, OrdersModule],
  controllers: [AdminAudiencesController],
  providers: [
    GetAudiencesHandler,
    { provide: AudienceFamilyReader, useClass: CatalogAudienceFamilyReader },
  ],
})
export class AudiencesModule {}

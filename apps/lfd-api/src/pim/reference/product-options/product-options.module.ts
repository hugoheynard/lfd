import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { ArchiveOptionGroupHandler } from "./application/archive-option-group.js";
import { CreateOptionGroupHandler } from "./application/create-option-group.js";
import { ListOptionGroupsHandler } from "./application/list-option-groups.js";
import { RestoreOptionGroupHandler } from "./application/restore-option-group.js";
import { UpdateOptionGroupHandler } from "./application/update-option-group.js";
import { OptionGroupOffers } from "./domain/ports/option-group-offers.reader.js";
import { OptionGroupRepository } from "./domain/ports/option-group.repository.js";
import { OptionGroupController } from "./http/option-group.controller.js";
import { PrismaOptionGroupOffers } from "./infrastructure/prisma-option-group-offers.reader.js";
import { PrismaOptionGroupRepository } from "./infrastructure/prisma-option-group.repository.js";

/**
 * Contexte **product-options** — les options de commande du référentiel
 * (`documentation/catalogue/plan-options-de-commande.md`, § 3.1) : le groupe
 * (« Tranchage ») et ses choix, sans prix.
 *
 * Ce qu'il publie : `OptionGroupOffers`, la lecture des groupes et de leurs
 * choix en service, que la fiche lit pour activer un groupe et le canal pour
 * le fait du catalogue. Ce qu'il demande : `OptionGroupHoldersReader`, les
 * fiches qui activent un groupe, que le catalogue implémente et que la racine
 * relie (`appBootstrap/option-group-holders-feed.module.ts`).
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [OptionGroupController],
  providers: [
    { provide: OptionGroupRepository, useClass: PrismaOptionGroupRepository },
    { provide: OptionGroupOffers, useClass: PrismaOptionGroupOffers },
    CreateOptionGroupHandler,
    UpdateOptionGroupHandler,
    ArchiveOptionGroupHandler,
    RestoreOptionGroupHandler,
    ListOptionGroupsHandler,
  ],
  exports: [OptionGroupOffers],
})
export class ProductOptionsModule {}

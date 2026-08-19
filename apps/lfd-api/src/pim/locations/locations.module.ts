import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { PimIdGenerator, UuidV7Generator } from "../infra/id/pim-id-generator.js";
import { CreateEmplacementHandler } from "./application/create-emplacement.js";
import { DeleteEmplacementHandler } from "./application/delete-emplacement.js";
import { GenerateTableQrHandler } from "./application/generate-table-qr.js";
import { ListEmplacementsHandler } from "./application/list-emplacements.js";
import { RemoveTableQrHandler } from "./application/remove-table-qr.js";
import { UpdateEmplacementHandler } from "./application/update-emplacement.js";
import { EmplacementRepository } from "./domain/ports/emplacement.repository.js";
import { TableTokenGenerator } from "./domain/ports/table-token-generator.js";
import { EmplacementController } from "./http/emplacement.controller.js";
import { PrismaEmplacementRepository } from "./infrastructure/prisma-emplacement.repository.js";
import { UuidTableTokenGenerator } from "./infrastructure/uuid-table-token-generator.js";

/**
 * Contexte **locations** — les emplacements (boutiques/points de vente) et leur
 * grille de tables click & collect. Modèle **CQRS** (un handler par cas). Aucune
 * dépendance au catalogue : un emplacement ne connaît ni produit ni gamme.
 */
@Module({
  imports: [PimDatabaseModule, CqrsModule],
  controllers: [EmplacementController],
  providers: [
    CreateEmplacementHandler,
    UpdateEmplacementHandler,
    DeleteEmplacementHandler,
    GenerateTableQrHandler,
    RemoveTableQrHandler,
    ListEmplacementsHandler,
    { provide: PimIdGenerator, useClass: UuidV7Generator },
    { provide: TableTokenGenerator, useClass: UuidTableTokenGenerator },
    { provide: EmplacementRepository, useClass: PrismaEmplacementRepository },
  ],
})
export class LocationsModule {}

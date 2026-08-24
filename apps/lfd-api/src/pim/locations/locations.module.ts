import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { PimIdGenerator, UuidV7Generator } from "../infra/id/pim-id-generator.js";
import { CreateLocationHandler } from "./application/create-location.js";
import { DeleteLocationHandler } from "./application/delete-location.js";
import { GenerateTableQrHandler } from "./application/generate-table-qr.js";
import { ListLocationsHandler } from "./application/list-locations.js";
import { RemoveTableQrHandler } from "./application/remove-table-qr.js";
import { UpdateLocationHandler } from "./application/update-location.js";
import { LocationRepository } from "./domain/ports/location.repository.js";
import { LocationUsageReader } from "./domain/ports/location-usage.reader.js";
import { TableTokenGenerator } from "./domain/ports/table-token-generator.js";
import { LocationController } from "./http/location.controller.js";
import { PrismaLocationRepository } from "./infrastructure/prisma-location.repository.js";
import { PrismaLocationUsageReader } from "./infrastructure/prisma-location-usage.reader.js";
import { UuidTableTokenGenerator } from "./infrastructure/uuid-table-token-generator.js";

/**
 * Contexte **locations** — les emplacements (boutiques/points de vente) et leur
 * grille de tables click & collect. Modèle **CQRS** (un handler par cas). Aucune
 * dépendance au catalogue : un emplacement ne connaît ni produit ni gamme.
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [LocationController],
  providers: [
    CreateLocationHandler,
    UpdateLocationHandler,
    DeleteLocationHandler,
    GenerateTableQrHandler,
    RemoveTableQrHandler,
    ListLocationsHandler,
    { provide: PimIdGenerator, useClass: UuidV7Generator },
    { provide: TableTokenGenerator, useClass: UuidTableTokenGenerator },
    { provide: LocationRepository, useClass: PrismaLocationRepository },
    { provide: LocationUsageReader, useClass: PrismaLocationUsageReader },
  ],
})
export class LocationsModule {}

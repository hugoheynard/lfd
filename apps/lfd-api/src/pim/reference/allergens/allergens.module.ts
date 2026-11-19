import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { PimChangesModule } from "../../changes/pim-changes.module.js";
import { ArchiveAllergenCategoryHandler } from "./application/archive-allergen-category.js";
import { ArchiveAllergenEntryHandler } from "./application/archive-allergen-entry.js";
import { CreateAllergenCategoryHandler } from "./application/create-allergen-category.js";
import { CreateAllergenEntryHandler } from "./application/create-allergen-entry.js";
import { ListAllergenCatalogueHandler } from "./application/list-allergen-catalogue.js";
import { MoveAllergenCategoryHandler } from "./application/move-allergen-category.js";
import { ReadAllergenReferenceHandler } from "./application/read-allergen-reference.js";
import { RenameAllergenCategoryHandler } from "./application/rename-allergen-category.js";
import { RestoreAllergenCategoryHandler } from "./application/restore-allergen-category.js";
import { RestoreAllergenEntryHandler } from "./application/restore-allergen-entry.js";
import { ReviseAllergenEntryHandler } from "./application/revise-allergen-entry.js";
import { AllergenCatalogueReader } from "./domain/ports/allergen-catalogue.reader.js";
import { AllergenCategoryRepository } from "./domain/ports/allergen-category.repository.js";
import { AllergenEntryRepository } from "./domain/ports/allergen-entry.repository.js";
import { AllergenEntryIdsReader } from "./domain/ports/allergen-entry-ids.reader.js";
import { AllergenController } from "./http/allergen.controller.js";
import { PrismaAllergenCatalogueReader } from "./infrastructure/prisma-allergen-catalogue.reader.js";
import { PrismaAllergenCategoryRepository } from "./infrastructure/prisma-allergen-category.repository.js";
import { PrismaAllergenEntryRepository } from "./infrastructure/prisma-allergen-entry.repository.js";
import { PrismaAllergenEntryIdsReader } from "./infrastructure/prisma-allergen-entry-ids.reader.js";

/**
 * Contexte **allergens** — le référentiel réglementaire, désormais servi depuis
 * la base.
 *
 * Il exporte ses deux lectures : `AllergenCatalogueReader`, que le catalogue
 * produit lit (l'endpoint de saisie, la validation d'une déclaration), et
 * `AllergenEntryIdsReader`, que les ingrédients lisent pour lier un code à son
 * entrée. Personne n'écrit dans le référentiel depuis ailleurs. Les deux dépôts d'écriture restent
 * privés — un consommateur ne dépend que de ce qu'il appelle (ISP), et exporter
 * `save()` inviterait le premier handler pressé à écrire une colonne depuis
 * ailleurs.
 */
@Module({
  imports: [PimDatabaseModule, PimChangesModule],
  controllers: [AllergenController],
  providers: [
    { provide: AllergenCatalogueReader, useClass: PrismaAllergenCatalogueReader },
    { provide: AllergenCategoryRepository, useClass: PrismaAllergenCategoryRepository },
    { provide: AllergenEntryRepository, useClass: PrismaAllergenEntryRepository },
    { provide: AllergenEntryIdsReader, useClass: PrismaAllergenEntryIdsReader },
    ReadAllergenReferenceHandler,
    ListAllergenCatalogueHandler,
    CreateAllergenCategoryHandler,
    RenameAllergenCategoryHandler,
    MoveAllergenCategoryHandler,
    ArchiveAllergenCategoryHandler,
    RestoreAllergenCategoryHandler,
    CreateAllergenEntryHandler,
    ReviseAllergenEntryHandler,
    ArchiveAllergenEntryHandler,
    RestoreAllergenEntryHandler,
  ],
  exports: [AllergenCatalogueReader, AllergenEntryIdsReader],
})
export class AllergensModule {}

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../infra/database/database.module.js';
import {
  IdGenerator,
  UuidV7Generator,
} from '../shared/identity/id-generator.js';
import { CategoryCommands } from './application/category-commands.service.js';
import { ProductCommands } from './application/product-commands.service.js';
import { CatalogueReader } from './domain/ports/catalogue-reader.js';
import { CategoryRepository } from './domain/ports/category.repository.js';
import { EditorialReader } from './domain/ports/editorial-reader.js';
import { EditorialRepository } from './domain/ports/editorial.repository.js';
import { NutritionRepository } from './domain/ports/nutrition.repository.js';
import { ProductRepository } from './domain/ports/product.repository.js';
import { CatalogueController } from './http/catalogue.controller.js';
import { ReferenceController } from './http/reference.controller.js';
import { PrismaCatalogueReader } from './infrastructure/prisma-catalogue-reader.js';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository.js';
import { PrismaEditorialReader } from './infrastructure/prisma-editorial-reader.js';
import { PrismaEditorialRepository } from './infrastructure/prisma-editorial.repository.js';
import { PrismaNutritionRepository } from './infrastructure/prisma-nutrition.repository.js';
import { PrismaProductRepository } from './infrastructure/prisma-product.repository.js';
import {
  PrismaSkuAvailability,
  SKU_AVAILABILITY,
} from './infrastructure/prisma-sku-availability.js';

/**
 * Câblage du module catalogue.
 *
 * Les classes abstraites (`CategoryRepository`, `ProductRepository`, `IdGenerator`)
 * servent de **jetons d'injection** : l'application dépend d'elles, l'infrastructure les
 * fournit. Remplacer Prisma ne touche que ce fichier.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [CatalogueController, ReferenceController],
  providers: [
    CategoryCommands,
    ProductCommands,
    { provide: IdGenerator, useClass: UuidV7Generator },
    { provide: CategoryRepository, useClass: PrismaCategoryRepository },
    { provide: ProductRepository, useClass: PrismaProductRepository },
    { provide: SKU_AVAILABILITY, useClass: PrismaSkuAvailability },
    { provide: CatalogueReader, useClass: PrismaCatalogueReader },
    { provide: NutritionRepository, useClass: PrismaNutritionRepository },
    { provide: EditorialRepository, useClass: PrismaEditorialRepository },
    { provide: EditorialReader, useClass: PrismaEditorialReader },
  ],
  // Seul contrat visible depuis l'extérieur : les adaptateurs de canal lisent le
  // catalogue par ce port, jamais par ses dépôts ni ses tables (ADR-13).
  exports: [CatalogueReader],
})
export class CatalogueModule {}

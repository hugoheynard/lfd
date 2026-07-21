import { Module } from '@nestjs/common';

import { DatabaseModule } from '../infra/database/database.module.js';
import {
  IdGenerator,
  UuidV7Generator,
} from '../shared/identity/id-generator.js';
import { CategoryCommands } from './application/category-commands.service.js';
import { ProductCommands } from './application/product-commands.service.js';
import { CategoryRepository } from './domain/ports/category.repository.js';
import { ProductRepository } from './domain/ports/product.repository.js';
import { CatalogueController } from './http/catalogue.controller.js';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository.js';
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
  controllers: [CatalogueController],
  providers: [
    CategoryCommands,
    ProductCommands,
    { provide: IdGenerator, useClass: UuidV7Generator },
    { provide: CategoryRepository, useClass: PrismaCategoryRepository },
    { provide: ProductRepository, useClass: PrismaProductRepository },
    { provide: SKU_AVAILABILITY, useClass: PrismaSkuAvailability },
  ],
})
export class CatalogueModule {}

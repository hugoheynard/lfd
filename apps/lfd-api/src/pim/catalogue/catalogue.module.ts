import { Module } from "@nestjs/common";

import { CommerceModule } from "../commerce/commerce.module.js";
import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { PimIdGenerator, UuidV7Generator } from "../infra/id/pim-id-generator.js";
import { ArchiveCategoryHandler } from "./category/application/archive-category.js";
import { ArchiveProductHandler } from "./product/application/archive-product.js";
import { CreateCategoryHandler } from "./category/application/create-category.js";
import { CreateProductHandler } from "./product/application/create-product.js";
import { ListCategoriesHandler } from "./category/application/list-categories.js";
import { MoveCategoryHandler } from "./category/application/move-category.js";
import { ReorderCategoriesHandler } from "./category/application/reorder-categories.js";
import { RenameCategoryHandler } from "./category/application/rename-category.js";
import { SetCategoryChannelsHandler } from "./category/application/set-category-channels.js";
import { SetCategoryTvaHandler } from "./category/application/set-category-tva.js";
import { DeclareProductNutritionHandler } from "./product/application/declare-product-nutrition.js";
import { GetProductDetailHandler } from "./product/application/get-product-detail.js";
import { ListProductsHandler } from "./product/application/list-products.js";
import { RestoreProductHandler } from "./product/application/restore-product.js";
import { UpdateProductEditorialHandler } from "./product/application/update-product-editorial.js";
import { UpdateProductIdentityHandler } from "./product/application/update-product-identity.js";
import { UpdateVariantPricingHandler } from "./product/application/update-variant-pricing.js";
import { CatalogueReader } from "./shared/domain/ports/catalogue-reader.js";
import { CategoryRepository } from "./category/domain/ports/category.repository.js";
import { EditorialReader } from "./product/domain/ports/editorial-reader.js";
import { EditorialRepository } from "./product/domain/ports/editorial.repository.js";
import { NutritionRepository } from "./product/domain/ports/nutrition.repository.js";
import { ProductRepository } from "./product/domain/ports/product.repository.js";
import { CategoryController } from "./category/http/category.controller.js";
import { ProductController } from "./product/http/product.controller.js";
import { ReferenceController } from "./shared/http/reference.controller.js";
import { PrismaCatalogueReader } from "./shared/infrastructure/prisma-catalogue-reader.js";
import { PrismaCategoryRepository } from "./category/infrastructure/prisma-category.repository.js";
import { PrismaEditorialReader } from "./product/infrastructure/prisma-editorial-reader.js";
import { PrismaEditorialRepository } from "./product/infrastructure/prisma-editorial.repository.js";
import { PrismaNutritionRepository } from "./product/infrastructure/prisma-nutrition.repository.js";
import { PrismaProductRepository } from "./product/infrastructure/prisma-product.repository.js";
import {
  PrismaSkuAvailability,
  SKU_AVAILABILITY,
} from "./product/infrastructure/prisma-sku-availability.js";

/**
 * Câblage du module catalogue.
 *
 * Les classes abstraites (`CategoryRepository`, `ProductRepository`, `PimIdGenerator`)
 * servent de **jetons d'injection** : l'application dépend d'elles, l'infrastructure les
 * fournit. Remplacer Prisma ne touche que ce fichier.
 */
@Module({
  imports: [PimDatabaseModule, CommerceModule],
  controllers: [CategoryController, ProductController, ReferenceController],
  providers: [
    // Familles (CQRS) — un handler par cas.
    CreateCategoryHandler,
    RenameCategoryHandler,
    SetCategoryChannelsHandler,
    SetCategoryTvaHandler,
    ArchiveCategoryHandler,
    ListCategoriesHandler,
    MoveCategoryHandler,
    ReorderCategoriesHandler,
    // Produits (CQRS) — un handler par cas.
    CreateProductHandler,
    UpdateProductIdentityHandler,
    UpdateVariantPricingHandler,
    UpdateProductEditorialHandler,
    DeclareProductNutritionHandler,
    ArchiveProductHandler,
    RestoreProductHandler,
    ListProductsHandler,
    GetProductDetailHandler,
    { provide: PimIdGenerator, useClass: UuidV7Generator },
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

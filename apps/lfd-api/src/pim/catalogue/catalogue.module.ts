import { Module } from "@nestjs/common";

import { AllergensModule } from "../allergens/allergens.module.js";
import { VatRatesModule } from "../vat-rates/vat-rates.module.js";
import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { PimIdGenerator, UuidV7Generator } from "../infra/id/pim-id-generator.js";
import { ArchiveCategoryHandler } from "./category/application/archive-category.js";
import { ArchiveProductHandler } from "./product/application/archive-product.js";
import { CreateCategoryHandler } from "./category/application/create-category.js";
import { AddProductVariantHandler } from "./product/application/add-product-variant.js";
import { AlignVariantRegulatoryHandler } from "./product/application/align-variant-regulatory.js";
import { CreateProductHandler } from "./product/application/create-product.js";
import { GetCategoryDetailHandler } from "./category/application/get-category-detail.js";
import { ListCategoriesHandler } from "./category/application/list-categories.js";
import { SetCategoryMediaHandler } from "./category/application/set-category-media.js";
import { UpdateCategoryEditorialHandler } from "./category/application/update-category-editorial.js";
import { CategoryEditorialReader } from "./category/domain/ports/category-editorial-reader.js";
import { CategoryEditorialRepository } from "./category/domain/ports/category-editorial.repository.js";
import { PrismaCategoryEditorialReader } from "./category/infrastructure/prisma-category-editorial.reader.js";
import { PrismaCategoryEditorialRepository } from "./category/infrastructure/prisma-category-editorial.repository.js";
import { MoveCategoryHandler } from "./category/application/move-category.js";
import { ReorderCategoriesHandler } from "./category/application/reorder-categories.js";
import { RenameCategoryHandler } from "./category/application/rename-category.js";
import { SetCategoryChannelsHandler } from "./category/application/set-category-channels.js";
import { SetCategoryVatHandler } from "./category/application/set-category-vat.js";
import { DeclareProductNutritionHandler } from "./product/application/declare-product-nutrition.js";
import { GetProductDetailHandler } from "./product/application/get-product-detail.js";
import { ListProductsHandler } from "./product/application/list-products.js";
import { DeclareProductReadyHandler } from "./product/application/declare-product-ready.js";
import { GetProductReadinessHandler } from "./product/application/get-product-readiness.js";
import { PublishProductHandler } from "./product/application/publish-product.js";
import { UnpublishProductHandler } from "./product/application/unpublish-product.js";
import { RestoreProductHandler } from "./product/application/restore-product.js";
import { SetProductMediaHandler } from "./product/application/set-product-media.js";
import { SetProductChannelsHandler } from "./product/application/set-product-channels.js";
import { SetProductVatHandler } from "./product/application/set-product-vat.js";
import { SweepOrphanMediaHandler } from "./product/application/sweep-orphan-media.js";
import { UploadProductImageHandler } from "./product/application/upload-product-image.js";
import { UpdateProductEditorialHandler } from "./product/application/update-product-editorial.js";
import { UpdateProductIdentityHandler } from "./product/application/update-product-identity.js";
import { UpdateVariantPricingHandler } from "./product/application/update-variant-pricing.js";
import { CatalogueReader } from "./shared/domain/ports/catalogue-reader.js";
import { SalesContextsModule } from "../sales-contexts/sales-contexts.module.js";
import { CategoryRepository } from "./category/domain/ports/category.repository.js";
import { PointOfSaleOfferReader } from "./shared/domain/ports/point-of-sale-offer.reader.js";
import { ProductCountReader } from "./category/domain/ports/product-count.reader.js";
import { AccountingRulesModule } from "../accounting-rules/accounting-rules.module.js";
import { CatalogRevisionRepository } from "./revision/domain/ports/catalog-revision.repository.js";
import { CatalogRevisionSource } from "./revision/domain/ports/catalog-revision.source.js";
import { DiffCatalogRevisionsHandler } from "./revision/application/diff-catalog-revisions.js";
import { GetCatalogOverviewHandler } from "./revision/application/get-catalog-overview.js";
import { ListCatalogRevisionsHandler } from "./revision/application/list-catalog-revisions.js";
import { TakeCatalogRevisionHandler } from "./revision/application/take-catalog-revision.js";
import { CatalogRevisionController } from "./revision/http/catalog-revision.controller.js";
import { PrismaCatalogRevisionRepository } from "./revision/infrastructure/prisma-catalog-revision.repository.js";
import { PrismaCatalogRevisionSource } from "./revision/infrastructure/prisma-catalog-revision.source.js";
import { EditorialReader } from "./product/domain/ports/editorial-reader.js";
import { ReadinessRepository } from "./product/domain/ports/readiness.repository.js";
import { EditorialRepository } from "./product/domain/ports/editorial.repository.js";
import { MediaLibrary } from "./product/domain/ports/media-library.js";
import { NutritionRepository } from "./product/domain/ports/nutrition.repository.js";
import { ProductRepository } from "./product/domain/ports/product.repository.js";
import { CategoryController } from "./category/http/category.controller.js";
import { MediaController } from "./product/http/media.controller.js";
import { MediaSweepController } from "./product/http/media-sweep.controller.js";
import { ProductController } from "./product/http/product.controller.js";
import { ReferenceController } from "./shared/http/reference.controller.js";
import { PrismaCatalogueReader } from "./shared/infrastructure/prisma-catalogue-reader.js";
import { PrismaCategoryRepository } from "./category/infrastructure/prisma-category.repository.js";
import { PrismaPointOfSaleOfferReader } from "./shared/infrastructure/prisma-point-of-sale-offer.reader.js";
import { PrismaProductCountReader } from "./category/infrastructure/prisma-product-count.reader.js";
import { PrismaEditorialReader } from "./product/infrastructure/prisma-editorial-reader.js";
import { PrismaReadinessRepository } from "./product/infrastructure/prisma-readiness.repository.js";
import { PrismaEditorialRepository } from "./product/infrastructure/prisma-editorial.repository.js";
import { PrismaMediaLibrary } from "./product/infrastructure/prisma-media-library.js";
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
  // `AllergensModule` n'exporte que son lecteur : la fiche réglementaire d'un
  // produit se valide contre le référentiel en base (D3), elle ne l'écrit
  // jamais.
  imports: [
    PimDatabaseModule,
    AllergensModule,
    VatRatesModule,
    SalesContextsModule,
    AccountingRulesModule,
  ],
  controllers: [
    CatalogRevisionController,
    CategoryController,
    MediaController,
    MediaSweepController,
    ProductController,
    ReferenceController,
  ],
  providers: [
    // Familles (CQRS) — un handler par cas.
    CreateCategoryHandler,
    RenameCategoryHandler,
    SetCategoryChannelsHandler,
    SetCategoryVatHandler,
    ArchiveCategoryHandler,
    ListCategoriesHandler,
    GetCategoryDetailHandler,
    UpdateCategoryEditorialHandler,
    SetCategoryMediaHandler,
    MoveCategoryHandler,
    ReorderCategoriesHandler,
    // Produits (CQRS) — un handler par cas.
    CreateProductHandler,
    AddProductVariantHandler,
    AlignVariantRegulatoryHandler,
    UpdateProductIdentityHandler,
    UpdateVariantPricingHandler,
    SetProductMediaHandler,
    SetProductChannelsHandler,
    SetProductVatHandler,
    UploadProductImageHandler,
    SweepOrphanMediaHandler,
    UpdateProductEditorialHandler,
    DeclareProductNutritionHandler,
    ArchiveProductHandler,
    RestoreProductHandler,
    ListProductsHandler,
    DeclareProductReadyHandler,
    GetProductReadinessHandler,
    PublishProductHandler,
    UnpublishProductHandler,
    GetProductDetailHandler,
    { provide: PimIdGenerator, useClass: UuidV7Generator },
    { provide: CategoryRepository, useClass: PrismaCategoryRepository },
    // Deux LECTURES posées hors du dépôt des familles : le compte de fiches
    // interroge les produits, l'existence d'un emplacement interroge les
    // emplacements. Ni l'un ni l'autre n'est la persistance d'une famille.
    { provide: ProductCountReader, useClass: PrismaProductCountReader },
    { provide: PointOfSaleOfferReader, useClass: PrismaPointOfSaleOfferReader },
    { provide: MediaLibrary, useClass: PrismaMediaLibrary },
    { provide: ProductRepository, useClass: PrismaProductRepository },
    { provide: SKU_AVAILABILITY, useClass: PrismaSkuAvailability },
    { provide: CatalogueReader, useClass: PrismaCatalogueReader },
    { provide: NutritionRepository, useClass: PrismaNutritionRepository },
    { provide: EditorialRepository, useClass: PrismaEditorialRepository },
    { provide: EditorialReader, useClass: PrismaEditorialReader },
    { provide: CatalogRevisionRepository, useClass: PrismaCatalogRevisionRepository },
    { provide: CatalogRevisionSource, useClass: PrismaCatalogRevisionSource },
    TakeCatalogRevisionHandler,
    ListCatalogRevisionsHandler,
    DiffCatalogRevisionsHandler,
    GetCatalogOverviewHandler,
    { provide: ReadinessRepository, useClass: PrismaReadinessRepository },
    { provide: CategoryEditorialReader, useClass: PrismaCategoryEditorialReader },
    { provide: CategoryEditorialRepository, useClass: PrismaCategoryEditorialRepository },
  ],
  // Seul contrat visible depuis l'extérieur : les adaptateurs de canal lisent le
  // catalogue par ce port, jamais par ses dépôts ni ses tables (ADR-13).
  //
  // Le registre des contextes n'y est plus : il a son propre module. Il sortait
  // d'ici parce qu'il y était rangé, pas parce qu'il en dépendait — et le
  // commentaire qui l'expliquait décrivait le symptôme, pas la raison.
  // Le dépôt des révisions sort d'ici : le canal B2B inscrit sa publication SUR
  // l'ancre qu'il vient de figer, et c'est le seul moyen qu'une ancre sache où
  // elle est partie. Le reste de la mécanique (source, capture) ne sort pas.
  exports: [CatalogueReader, CatalogRevisionRepository],
})
export class CatalogueModule {}

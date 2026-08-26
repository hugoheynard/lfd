import { Logger, Module, type OnModuleInit } from "@nestjs/common";

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
import { SetCategoryVatHandler } from "./category/application/set-category-vat.js";
import { DeclareProductNutritionHandler } from "./product/application/declare-product-nutrition.js";
import { GetProductDetailHandler } from "./product/application/get-product-detail.js";
import { ListProductsHandler } from "./product/application/list-products.js";
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
import { SalesContextRegistry } from "./shared/domain/ports/sales-context.registry.js";
import { StartupReport } from "../../platform/startup/startup-report.service.js";
import { CategoryRepository } from "./category/domain/ports/category.repository.js";
import { KnownLocationsReader } from "./category/domain/ports/known-locations.reader.js";
import { ProductCountReader } from "./category/domain/ports/product-count.reader.js";
import { EditorialReader } from "./product/domain/ports/editorial-reader.js";
import { EditorialRepository } from "./product/domain/ports/editorial.repository.js";
import { MediaLibrary } from "./product/domain/ports/media-library.js";
import { NutritionRepository } from "./product/domain/ports/nutrition.repository.js";
import { ProductRepository } from "./product/domain/ports/product.repository.js";
import { CategoryController } from "./category/http/category.controller.js";
import { MediaController } from "./product/http/media.controller.js";
import { MediaSweepController } from "./product/http/media-sweep.controller.js";
import { ProductController } from "./product/http/product.controller.js";
import { ReferenceController } from "./shared/http/reference.controller.js";
import { SalesContextController } from "./shared/http/sales-context.controller.js";
import { OpsChannelParityController } from "./shared/http/ops-channel-parity.controller.js";
import { ChannelParityReader } from "./shared/infrastructure/channel-parity.reader.js";
import { PrismaCatalogueReader } from "./shared/infrastructure/prisma-catalogue-reader.js";
import { PrismaSalesContextRegistry } from "./shared/infrastructure/prisma-sales-context.registry.js";
import { PrismaCategoryRepository } from "./category/infrastructure/prisma-category.repository.js";
import { PrismaKnownLocationsReader } from "./category/infrastructure/prisma-known-locations.reader.js";
import { PrismaProductCountReader } from "./category/infrastructure/prisma-product-count.reader.js";
import { PrismaEditorialReader } from "./product/infrastructure/prisma-editorial-reader.js";
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
  imports: [PimDatabaseModule, CommerceModule],
  controllers: [
    CategoryController,
    MediaController,
    MediaSweepController,
    ProductController,
    ReferenceController,
    SalesContextController,
    OpsChannelParityController,
  ],
  providers: [
    // Familles (CQRS) — un handler par cas.
    CreateCategoryHandler,
    RenameCategoryHandler,
    SetCategoryChannelsHandler,
    SetCategoryVatHandler,
    ArchiveCategoryHandler,
    ListCategoriesHandler,
    MoveCategoryHandler,
    ReorderCategoriesHandler,
    // Produits (CQRS) — un handler par cas.
    CreateProductHandler,
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
    PublishProductHandler,
    UnpublishProductHandler,
    GetProductDetailHandler,
    { provide: PimIdGenerator, useClass: UuidV7Generator },
    { provide: CategoryRepository, useClass: PrismaCategoryRepository },
    // Deux LECTURES posées hors du dépôt des familles : le compte de fiches
    // interroge les produits, l'existence d'un emplacement interroge les
    // emplacements. Ni l'un ni l'autre n'est la persistance d'une famille.
    { provide: ProductCountReader, useClass: PrismaProductCountReader },
    { provide: KnownLocationsReader, useClass: PrismaKnownLocationsReader },
    { provide: MediaLibrary, useClass: PrismaMediaLibrary },
    { provide: ProductRepository, useClass: PrismaProductRepository },
    { provide: SKU_AVAILABILITY, useClass: PrismaSkuAvailability },
    { provide: CatalogueReader, useClass: PrismaCatalogueReader },
    { provide: SalesContextRegistry, useClass: PrismaSalesContextRegistry },
    ChannelParityReader,
    { provide: NutritionRepository, useClass: PrismaNutritionRepository },
    { provide: EditorialRepository, useClass: PrismaEditorialRepository },
    { provide: EditorialReader, useClass: PrismaEditorialReader },
  ],
  // Seul contrat visible depuis l'extérieur : les adaptateurs de canal lisent le
  // catalogue par ce port, jamais par ses dépôts ni ses tables (ADR-13).
  // Le registre sort AVEC le lecteur : les canaux itèrent les contextes, et
  // Shopify doit savoir lesquels il projette.
  exports: [CatalogueReader, SalesContextRegistry],
})
export class CatalogueModule implements OnModuleInit {
  private readonly logger = new Logger(CatalogueModule.name);

  constructor(
    private readonly contexts: SalesContextRegistry,
    private readonly startup: StartupReport,
  ) {}

  /**
   * Garantit le contexte de vente **racine** au démarrage.
   *
   * Même contrat, et même raison, que l'admin racine : sans le contexte B2B,
   * aucune TVA professionnelle ne se règle et la boutique pro se vide — **sans
   * qu'une seule erreur soit levée**. Une panne silencieuse mérite une garde au
   * boot ; une panne bruyante peut attendre qu'on la lise.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.contexts.ensureRootContext();
    } catch (error) {
      // On ne bloque PAS le boot : le prochain démarrage réessaiera, et un
      // souci transitoire de base ne doit pas tuer l'API. Mais on ne le garde
      // pas pour nous : sans ce rapport, la cause la plus fréquente — une
      // migration non appliquée — se manifesterait par un catalogue B2B vide,
      // ce qui n'oriente vers rien.
      this.logger.error("ensureRootContext a échoué", error);
      this.startup.report({
        capability: "Contexte de vente racine (B2B)",
        setting: "—",
        consequence:
          "le contexte B2B n'a pas pu être semé — cause la plus fréquente : une migration " +
          "non appliquée. Symptôme visible : la boutique professionnelle se vide",
        severity: "blocking",
      });
    }
  }
}

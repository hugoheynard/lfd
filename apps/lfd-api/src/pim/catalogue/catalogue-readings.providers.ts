import type { Provider } from "@nestjs/common";

import { AllProductsReader } from "./product/domain/ports/all-products.reader.js";
import { PrismaAllProductsReader } from "./product/infrastructure/prisma-all-products.reader.js";
import { EffectiveVatReader } from "./product/domain/ports/effective-vat.reader.js";
import { ResolvedEffectiveVatReader } from "./product/infrastructure/resolved-effective-vat.reader.js";
import { AllCategoriesReader } from "./category/domain/ports/all-categories.reader.js";
import { PrismaAllCategoriesReader } from "./category/infrastructure/prisma-all-categories.reader.js";
import { FamilyVatReader } from "./category/domain/ports/family-vat.reader.js";
import { RepositoryFamilyVatReader } from "./category/infrastructure/repository-family-vat.reader.js";
import { ProductRecordsReader } from "./product/domain/ports/product-records.reader.js";
import { RepositoryProductRecordsReader } from "./product/infrastructure/repository-product-records.reader.js";
import { CategorySnapshotsReader } from "./category/domain/ports/category-snapshots.reader.js";
import { RepositoryCategorySnapshotsReader } from "./category/infrastructure/repository-category-snapshots.reader.js";
import { ProductImageHolders } from "./product/domain/ports/product-image-holders.js";
import { ProductImageRepointing } from "./product/domain/ports/product-image-repointing.js";
import { PrismaProductImageHolders } from "./product/infrastructure/prisma-product-image-holders.js";
import { PrismaProductImageRepointing } from "./product/infrastructure/prisma-product-image-repointing.js";
import { ProductTalliesReader } from "./product/domain/ports/product-tallies.reader.js";
import { PrismaProductTalliesReader } from "./product/infrastructure/prisma-product-tallies.reader.js";
import { ProductPlacementReader } from "./product/domain/ports/product-placement.reader.js";
import { PrismaProductPlacementReader } from "./product/infrastructure/prisma-product-placement.reader.js";
import { CategoryIdsReader } from "./category/domain/ports/category-ids.reader.js";
import { PrismaCategoryIdsReader } from "./category/infrastructure/prisma-category-ids.reader.js";
import { CategoryChainReader } from "./category/domain/ports/category-chain.reader.js";
import { PrismaCategoryChainReader } from "./category/infrastructure/prisma-category-chain.reader.js";
import { CategoryImageHolders } from "./category/domain/ports/category-image-holders.js";
import { CategoryImageRepointing } from "./category/domain/ports/category-image-repointing.js";
import { PrismaCategoryImageHolders } from "./category/infrastructure/prisma-category-image-holders.js";
import { PrismaCategoryImageRepointing } from "./category/infrastructure/prisma-category-image-repointing.js";
import { CategoryVatHoldersReader } from "./category/domain/ports/category-vat-holders.reader.js";
import { PrismaCategoryVatHoldersReader } from "./category/infrastructure/prisma-category-vat-holders.reader.js";
import { ProductVatHoldersReader } from "./product/domain/ports/product-vat-holders.reader.js";
import { PrismaProductVatHoldersReader } from "./product/infrastructure/prisma-product-vat-holders.reader.js";
import { AllergenListingReader } from "./product/domain/ports/allergen-listing.reader.js";
import { PrismaAllergenListingReader } from "./product/infrastructure/prisma-allergen-listing.reader.js";
import { AllergenFreshnessReader } from "./product/domain/ports/allergen-freshness.reader.js";
import { PrismaAllergenFreshnessReader } from "./product/infrastructure/prisma-allergen-freshness.reader.js";

import { CategoryContextRatesReader } from "./category/domain/ports/category-context-rates.reader.js";
import { PrismaCategoryContextRatesReader } from "./category/infrastructure/prisma-category-context-rates.reader.js";
import { CategoryRateUsageReader } from "./category/domain/ports/category-rate-usage.reader.js";
import { PrismaCategoryRateUsageReader } from "./category/infrastructure/prisma-category-rate-usage.reader.js";
import { ProductContextRatesReader } from "./product/domain/ports/product-context-rates.reader.js";
import { PrismaProductContextRatesReader } from "./product/infrastructure/prisma-product-context-rates.reader.js";
import { ProductRateUsageReader } from "./product/domain/ports/product-rate-usage.reader.js";
import { PrismaProductRateUsageReader } from "./product/infrastructure/prisma-product-rate-usage.reader.js";
import { CategoryNamesReader } from "./category/domain/ports/category-names.reader.js";
import { PrismaCategoryNamesReader } from "./category/infrastructure/prisma-category-names.reader.js";
import { ProductSkusReader } from "./product/domain/ports/product-skus.reader.js";
import { PrismaProductSkusReader } from "./product/infrastructure/prisma-product-skus.reader.js";

/**
 * **Ce que la fiche et la famille savent répondre** : les lectures qu'elles
 * publient, chacune par capacité, et leurs porteurs d'images. Les canaux, la
 * médiathèque, le référentiel des taux et celui des contextes de vente composent par elles, jamais par les
 * dépôts ni les tables.
 */
export const CATALOGUE_READINGS: readonly Provider[] = [
  { provide: AllProductsReader, useClass: PrismaAllProductsReader },
  { provide: AllCategoriesReader, useClass: PrismaAllCategoriesReader },
  { provide: FamilyVatReader, useClass: RepositoryFamilyVatReader },
  { provide: ProductRecordsReader, useClass: RepositoryProductRecordsReader },
  { provide: CategorySnapshotsReader, useClass: RepositoryCategorySnapshotsReader },
  { provide: EffectiveVatReader, useClass: ResolvedEffectiveVatReader },
  { provide: ProductTalliesReader, useClass: PrismaProductTalliesReader },
  { provide: ProductPlacementReader, useClass: PrismaProductPlacementReader },
  { provide: CategoryIdsReader, useClass: PrismaCategoryIdsReader },
  { provide: CategoryChainReader, useClass: PrismaCategoryChainReader },
  { provide: ProductImageHolders, useClass: PrismaProductImageHolders },
  { provide: ProductImageRepointing, useClass: PrismaProductImageRepointing },
  { provide: CategoryImageHolders, useClass: PrismaCategoryImageHolders },
  { provide: CategoryImageRepointing, useClass: PrismaCategoryImageRepointing },
  { provide: CategoryVatHoldersReader, useClass: PrismaCategoryVatHoldersReader },
  { provide: ProductVatHoldersReader, useClass: PrismaProductVatHoldersReader },
  { provide: AllergenListingReader, useClass: PrismaAllergenListingReader },
  { provide: AllergenFreshnessReader, useClass: PrismaAllergenFreshnessReader },
  { provide: CategoryContextRatesReader, useClass: PrismaCategoryContextRatesReader },
  { provide: CategoryRateUsageReader, useClass: PrismaCategoryRateUsageReader },
  { provide: ProductContextRatesReader, useClass: PrismaProductContextRatesReader },
  { provide: ProductRateUsageReader, useClass: PrismaProductRateUsageReader },
  { provide: CategoryNamesReader, useClass: PrismaCategoryNamesReader },
  { provide: ProductSkusReader, useClass: PrismaProductSkusReader },
];

/** Les jetons de ces lectures, tels que le module les exporte. */
export const CATALOGUE_READING_PORTS = [
  AllProductsReader,
  AllCategoriesReader,
  ProductRecordsReader,
  CategorySnapshotsReader,
  ProductImageHolders,
  ProductImageRepointing,
  CategoryImageHolders,
  CategoryImageRepointing,
  CategoryVatHoldersReader,
  ProductVatHoldersReader,
  CategoryContextRatesReader,
  CategoryRateUsageReader,
  ProductContextRatesReader,
  ProductRateUsageReader,
  CategoryNamesReader,
  ProductSkusReader,
  ProductPlacementReader,
  CategoryChainReader,
] as const;

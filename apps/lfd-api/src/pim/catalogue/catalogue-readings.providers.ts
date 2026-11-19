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

/**
 * **Ce que la fiche et la famille savent répondre** : les lectures qu'elles
 * publient, chacune par capacité, et leurs porteurs d'images. Les canaux et
 * la médiathèque composent par elles, jamais par les dépôts ni les tables.
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
] as const;

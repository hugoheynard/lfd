import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SkuAlreadyUsedError } from "../domain/errors/sku-errors.js";
import {
  ProductRepository,
  type NewProduct,
  type ProductKind,
  type ProductRecord,
  type ProductStatus,
  type VariantRecord,
} from "../domain/ports/product.repository.js";
import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";
import {
  isUniqueViolation,
  localizedColumn,
  readLocalizedColumn,
  readStringArrayColumn,
  readStringMapColumn,
} from "../../shared/infrastructure/json-readers.js";

interface NutritionRow {
  allergens: unknown;
  mayContain: unknown;
  energyKcal: number | null;
  carbsG: number | null;
  fatG: number | null;
  proteinG: number | null;
  glycemicIndex: number | null;
}

interface VariantRow {
  id: string;
  sku: string;
  name: unknown;
  options: unknown;
  isDefault: boolean;
  isDiscontinued: boolean;
  position: number;
  priceCents: number | null;
  weightGrams: number | null;
  nutrition: NutritionRow | null;
}

interface ProductRow {
  id: string;
  sku: string;
  name: unknown;
  slug: unknown;
  kind: ProductKind;
  categoryId: string;
  status: ProductStatus;
  variants: VariantRow[];
}

function toVariant(row: VariantRow): VariantRecord {
  return {
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, "variant.name"),
    options: readStringMapColumn(row.options, "variant.options"),
    isDefault: row.isDefault,
    isDiscontinued: row.isDiscontinued,
    position: row.position,
    priceCents: row.priceCents,
    weightGrams: row.weightGrams,
    allergens:
      row.nutrition === null
        ? null
        : readStringArrayColumn(row.nutrition.allergens, "nutrition.allergens"),
    nutrition:
      row.nutrition === null
        ? null
        : {
            mayContain: readStringArrayColumn(row.nutrition.mayContain, "nutrition.mayContain"),
            energyKcal: row.nutrition.energyKcal,
            carbsG: row.nutrition.carbsG,
            fatG: row.nutrition.fatG,
            proteinG: row.nutrition.proteinG,
            glycemicIndex: row.nutrition.glycemicIndex,
          },
  };
}

function toRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, "product.name"),
    slug: readLocalizedColumn(row.slug, "product.slug"),
    kind: row.kind,
    categoryId: row.categoryId,
    status: row.status,
    variants: row.variants.map(toVariant),
  };
}

@Injectable()
export class PrismaProductRepository extends ProductRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findById(id: string): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          orderBy: { position: "asc" },
          include: { nutrition: true },
        },
      },
    });
    return row === null ? null : toRecord(row);
  }

  async listAll(): Promise<ProductRecord[]> {
    const rows = await this.prisma.product.findMany({
      include: {
        variants: {
          orderBy: { position: "asc" },
          include: { nutrition: true },
        },
      },
      orderBy: { sku: "asc" },
    });
    return rows.map(toRecord);
  }

  /**
   * Produit + déclinaison par défaut + réservation des deux références, **en une
   * transaction**. L'invariant « au moins une déclinaison, exactement une par défaut »
   * n'est ainsi jamais faux, même une fraction de seconde.
   *
   * C'est ici — et nulle part ailleurs — que la violation d'unicité Postgres est traduite
   * en erreur métier : ni le handler ni le contrôleur ne connaissent le code `P2002`.
   */
  async createWithDefaultVariant(product: NewProduct): Promise<void> {
    const { defaultVariant } = product;

    try {
      await this.prisma.$transaction([
        this.prisma.skuRegistry.create({
          data: {
            value: product.sku.value,
            ownerType: "product",
            ownerId: product.id,
          },
        }),
        this.prisma.skuRegistry.create({
          data: {
            value: defaultVariant.sku.value,
            ownerType: "variant",
            ownerId: defaultVariant.id,
          },
        }),
        this.prisma.product.create({
          data: {
            id: product.id,
            sku: product.sku.value,
            name: localizedColumn(product.name),
            slug: localizedColumn(product.slug),
            kind: product.kind,
            categoryId: product.categoryId,
            variants: {
              create: {
                id: defaultVariant.id,
                sku: defaultVariant.sku.value,
                name: localizedColumn(defaultVariant.name),
                isDefault: true,
                position: 0,
              },
            },
          },
        }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SkuAlreadyUsedError(product.sku.value);
      }
      throw error;
    }
  }

  async rename(id: string, name: LocalizedText, slug: LocalizedText): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { name: localizedColumn(name), slug: localizedColumn(slug) },
    });
  }

  async setStatus(id: string, status: ProductStatus): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { status } });
  }

  async setKind(id: string, kind: ProductKind): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { kind } });
  }

  async moveToCategory(id: string, categoryId: string): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { categoryId } });
  }

  async setVariantPrice(variantId: string, priceCents: number | null): Promise<void> {
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { priceCents },
    });
  }

  async setVariantWeight(variantId: string, weightGrams: number | null): Promise<void> {
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { weightGrams },
    });
  }
}

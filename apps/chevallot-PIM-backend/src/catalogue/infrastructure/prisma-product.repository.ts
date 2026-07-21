import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/database/prisma.service.js';
import { SkuAlreadyUsedError } from '../domain/errors/sku-errors.js';
import {
  ProductRepository,
  type NewProduct,
  type ProductKind,
  type ProductRecord,
  type ProductStatus,
  type VariantRecord,
} from '../domain/ports/product.repository.js';
import type { LocalizedText } from '../domain/value-objects/localized-text.js';
import {
  isUniqueViolation,
  localizedColumn,
  readLocalizedColumn,
  readStringArrayColumn,
  readStringMapColumn,
} from './json-readers.js';

interface VariantRow {
  id: string;
  sku: string;
  name: unknown;
  options: unknown;
  isDefault: boolean;
  isDiscontinued: boolean;
  position: number;
  nutrition: { allergens: unknown } | null;
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
    name: readLocalizedColumn(row.name, 'variant.name'),
    options: readStringMapColumn(row.options, 'variant.options'),
    isDefault: row.isDefault,
    isDiscontinued: row.isDiscontinued,
    position: row.position,
    allergens:
      row.nutrition === null
        ? null
        : readStringArrayColumn(row.nutrition.allergens, 'nutrition.allergens'),
  };
}

function toRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, 'product.name'),
    slug: readLocalizedColumn(row.slug, 'product.slug'),
    kind: row.kind,
    categoryId: row.categoryId,
    status: row.status,
    variants: row.variants.map(toVariant),
  };
}

@Injectable()
export class PrismaProductRepository extends ProductRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          orderBy: { position: 'asc' },
          include: { nutrition: { select: { allergens: true } } },
        },
      },
    });
    return row === null ? null : toRecord(row);
  }

  async listAll(): Promise<ProductRecord[]> {
    const rows = await this.prisma.product.findMany({
      include: {
        variants: {
          orderBy: { position: 'asc' },
          include: { nutrition: { select: { allergens: true } } },
        },
      },
      orderBy: { sku: 'asc' },
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
            ownerType: 'product',
            ownerId: product.id,
          },
        }),
        this.prisma.skuRegistry.create({
          data: {
            value: defaultVariant.sku.value,
            ownerType: 'variant',
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

  async rename(
    id: string,
    name: LocalizedText,
    slug: LocalizedText,
  ): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { name: localizedColumn(name), slug: localizedColumn(slug) },
    });
  }

  async setStatus(id: string, status: ProductStatus): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { status } });
  }
}

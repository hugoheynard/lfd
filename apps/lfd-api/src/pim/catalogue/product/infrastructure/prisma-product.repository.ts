import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SkuAlreadyUsedError } from "../domain/errors/sku-errors.js";
import { Product, type ProductSnapshot } from "../domain/entities/product.js";
import type { VariantSnapshot } from "../domain/entities/variant.js";
import {
  ProductRepository,
  type ProductKind,
  type ProductStatus,
} from "../domain/ports/product.repository.js";
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

function toVariant(row: VariantRow): VariantSnapshot {
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

function toProduct(row: ProductRow): Product {
  return Product.reconstitute({
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, "product.name"),
    slug: readLocalizedColumn(row.slug, "product.slug"),
    kind: row.kind,
    categoryId: row.categoryId,
    status: row.status,
    variants: row.variants.map(toVariant),
  });
}

/** Les colonnes du produit lui-même — les déclinaisons ont les leurs. */
function toColumns(snapshot: ProductSnapshot) {
  return {
    name: localizedColumn(snapshot.name),
    slug: localizedColumn(snapshot.slug),
    kind: snapshot.kind,
    categoryId: snapshot.categoryId,
    status: snapshot.status,
  };
}

@Injectable()
export class PrismaProductRepository extends ProductRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          orderBy: { position: "asc" },
          include: { nutrition: true },
        },
      },
    });
    return row === null ? null : toProduct(row);
  }

  async listAll(): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      include: {
        variants: {
          orderBy: { position: "asc" },
          include: { nutrition: true },
        },
      },
      orderBy: { sku: "asc" },
    });
    return rows.map(toProduct);
  }

  /**
   * Produit + déclinaison par défaut + réservation des deux références, **en une
   * transaction**. L'invariant « au moins une déclinaison, exactement une par défaut »
   * n'est ainsi jamais faux, même une fraction de seconde.
   *
   * C'est ici — et nulle part ailleurs — que la violation d'unicité Postgres est traduite
   * en erreur métier : ni le handler ni le contrôleur ne connaissent le code `P2002`.
   */
  async add(product: Product): Promise<void> {
    const snapshot = product.snapshot();
    const [defaultVariant] = snapshot.variants;
    if (defaultVariant === undefined) {
      // Inatteignable : l'agrégat refuse de naître sans déclinaison par défaut.
      throw new Error("produit sans déclinaison — invariant 2 violé avant écriture");
    }

    try {
      await this.prisma.$transaction([
        this.prisma.skuRegistry.create({
          data: { value: snapshot.sku, ownerType: "product", ownerId: snapshot.id },
        }),
        this.prisma.skuRegistry.create({
          data: { value: defaultVariant.sku, ownerType: "variant", ownerId: defaultVariant.id },
        }),
        this.prisma.product.create({
          data: {
            id: snapshot.id,
            sku: snapshot.sku,
            ...toColumns(snapshot),
            variants: {
              create: {
                id: defaultVariant.id,
                sku: defaultVariant.sku,
                name: localizedColumn(defaultVariant.name),
                isDefault: defaultVariant.isDefault,
                position: defaultVariant.position,
              },
            },
          },
        }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SkuAlreadyUsedError(snapshot.sku);
      }
      throw error;
    }
  }

  /**
   * Écrit le produit ET ses déclinaisons, en une transaction. On réécrit
   * toutes les déclinaisons plutôt que de deviner celles qui ont bougé : un
   * agrégat en porte une poignée, et « deviner » est précisément ce que
   * l'ancien port faisait — une méthode par mutation, à tenir d'accord avec
   * le domaine à la main.
   */
  async save(product: Product): Promise<void> {
    const snapshot = product.snapshot();
    await this.prisma.$transaction([
      this.prisma.product.update({ where: { id: snapshot.id }, data: toColumns(snapshot) }),
      ...snapshot.variants.map((variant) =>
        this.prisma.productVariant.update({
          where: { id: variant.id },
          data: {
            name: localizedColumn(variant.name),
            isDefault: variant.isDefault,
            isDiscontinued: variant.isDiscontinued,
            position: variant.position,
            priceCents: variant.priceCents,
            weightGrams: variant.weightGrams,
          },
        }),
      ),
    ]);
  }
}

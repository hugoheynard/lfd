import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { isLiveStatus } from "../../product/domain/ports/product.repository.js";
import { alignedAllergenSheet } from "../../product/domain/services/aligned-allergen-sheet.js";
import {
  readLocalizedColumn,
  readStringArrayColumn,
} from "../../shared/infrastructure/json-readers.js";
import {
  AllergenMatrixSource,
  type MatrixFamilyRecord,
  type MatrixProductRecord,
  type MatrixVariantRecord,
} from "../domain/ports/allergen-matrix.source.js";

/** Les colonnes que la matrice lit d'une déclinaison — rien de plus. */
const MATRIX_VARIANT_SELECT = {
  id: true,
  sku: true,
  name: true,
  position: true,
  isDefault: true,
  isDiscontinued: true,
  regulatoryFollowsDefault: true,
  allergenSheet: { select: { allergens: true, mayContain: true } },
} as const;

/**
 * L'adaptateur. Les fiches se lisent en type ALLÉGÉ : nom, statut, famille,
 * déclinaisons et leurs allergènes — ni nutrition, ni TVA de contexte, que
 * l'agrégat chargerait pour rien. L'alignement sur le défaut reste résolu par
 * la règle du domaine (`alignedAllergenSheet`, celle de `Product.snapshot`),
 * jamais réécrit ici. Les familles passent par leur dépôt.
 */
@Injectable()
export class RepositoryAllergenMatrixSource extends AllergenMatrixSource {
  constructor(
    private readonly categoryRepository: CategoryRepository,
    private readonly prisma: PimPrismaService,
  ) {
    super();
  }

  async products(): Promise<readonly MatrixProductRecord[]> {
    const rows = await this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        categoryId: true,
        variants: { orderBy: { position: "asc" }, select: MATRIX_VARIANT_SELECT },
      },
      orderBy: { sku: "asc" },
    });
    return rows
      .filter((row) => isLiveStatus(row.status))
      .map((row) => ({
        id: row.id,
        name: readLocalizedColumn(row.name, "product.name"),
        status: row.status,
        categoryId: row.categoryId,
        variants: resolvedVariants(row.variants.map(toMatrixVariant)),
      }));
  }

  async families(): Promise<readonly MatrixFamilyRecord[]> {
    const all = await this.categoryRepository.listAll();
    return all.map((category) => ({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      position: category.position,
      isArchived: category.isArchived,
    }));
  }

  /**
   * Trois agrégats `max` et non une relecture des lignes : la date est un
   * maximum, la base le calcule. Pas de déclinaison archivée à écarter — une
   * déclinaison n'en a pas (plan §0).
   */
  async lastModifiedAt(productIds: readonly string[]): Promise<Date | null> {
    if (productIds.length === 0) {
      return null;
    }
    const ids = [...productIds];
    const [products, variants, sheets] = await Promise.all([
      this.prisma.product.aggregate({ where: { id: { in: ids } }, _max: { updatedAt: true } }),
      this.prisma.productVariant.aggregate({
        where: { productId: { in: ids } },
        _max: { updatedAt: true },
      }),
      this.prisma.variantAllergens.aggregate({
        where: { variant: { productId: { in: ids } } },
        _max: { updatedAt: true },
      }),
    ]);
    const dates = [products._max.updatedAt, variants._max.updatedAt, sheets._max.updatedAt].filter(
      (date): date is Date => date !== null,
    );
    return dates.reduce<Date | null>(
      (latest, date) => (latest === null || date > latest ? date : latest),
      null,
    );
  }
}

/** Une déclinaison lue, avant la résolution de l'alignement. */
interface ReadVariant extends MatrixVariantRecord {
  readonly isDefault: boolean;
  readonly regulatoryFollowsDefault: boolean;
}

function toMatrixVariant(row: {
  readonly id: string;
  readonly sku: string;
  readonly name: unknown;
  readonly position: number;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  readonly regulatoryFollowsDefault: boolean;
  readonly allergenSheet: { readonly allergens: unknown; readonly mayContain: unknown } | null;
}): ReadVariant {
  return {
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, "variant.name"),
    position: row.position,
    isDefault: row.isDefault,
    isDiscontinued: row.isDiscontinued,
    regulatoryFollowsDefault: row.regulatoryFollowsDefault,
    // Pas de ligne = personne n'a déclaré ; une ligne, même vide, est une affirmation.
    allergenSheet:
      row.allergenSheet === null
        ? null
        : {
            declared: readStringArrayColumn(
              row.allergenSheet.allergens,
              "variant_allergens.allergens",
            ),
            mayContain: readStringArrayColumn(
              row.allergenSheet.mayContain,
              "variant_allergens.may_contain",
            ),
          },
  };
}

/** Une déclinaison alignée prend les allergènes du défaut — la règle de l'agrégat. */
function resolvedVariants(variants: readonly ReadVariant[]): MatrixVariantRecord[] {
  const defaultVariant = variants.find((variant) => variant.isDefault);
  return variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    position: variant.position,
    isDiscontinued: variant.isDiscontinued,
    allergenSheet:
      defaultVariant === undefined
        ? variant.allergenSheet
        : alignedAllergenSheet(variant, defaultVariant),
  }));
}

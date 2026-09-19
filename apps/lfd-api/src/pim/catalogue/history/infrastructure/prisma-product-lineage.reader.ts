import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { effectiveVat } from "../../shared/domain/value-objects/context-vat.js";
import { SOURCE_LOCALE } from "../../shared/domain/value-objects/localized-text.js";
import { readLocalizedColumn } from "../../shared/infrastructure/json-readers.js";
import type { LineageLink, ProductLineage, RevisionMark } from "../domain/product-lineage.js";
import { ProductLineageReader } from "../domain/ports/product-lineage.reader.js";

/** Un arbre de familles n'a pas cette profondeur ; une boucle en base, si. */
const MAX_CATEGORY_DEPTH = 32;

interface CategoryRow {
  readonly id: string;
  readonly name: unknown;
  readonly parentId: string | null;
}

/**
 * La lignée d'une fiche, lue dans les tables du référentiel — et seulement
 * elles.
 *
 * Le taux appliqué passe par `effectiveVat`, la règle unique « la fiche
 * d'abord, sa famille ensuite » : une seconde écriture de cette règle ici
 * finirait par dire un autre taux que celui qu'on facture.
 */
@Injectable()
export class PrismaProductLineageReader extends ProductLineageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async lineageOf(productId: string): Promise<ProductLineage | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        categoryId: true,
        contextVat: { select: { contextId: true, vatRateId: true } },
        variants: { select: { sku: true } },
        ingredients: {
          orderBy: { position: "asc" },
          select: {
            ingredient: {
              select: {
                key: true,
                name: true,
                appellation: { select: { code: true, label: true } },
              },
            },
          },
        },
      },
    });
    if (product === null) {
      return null;
    }
    const cited = product.ingredients.map((row) => row.ingredient);
    const [categories, vatRates, revisions] = await Promise.all([
      this.categoryChain(product.categoryId),
      this.appliedRates(product.categoryId, byContext(product.contextVat)),
      this.revisionsHolding(product.variants.map((variant) => variant.sku)),
    ]);
    return {
      productId: product.id,
      categories,
      vatRates,
      ingredients: cited.map((ingredient) => ({
        id: ingredient.key,
        label: labelOf(ingredient.name, "ingredient.name"),
      })),
      appellations: uniqueById(
        cited.flatMap((ingredient) =>
          ingredient.appellation === null
            ? []
            : [
                {
                  id: ingredient.appellation.code,
                  label: labelOf(ingredient.appellation.label, "appellation.label"),
                },
              ],
        ),
      ),
      revisions,
    };
  }

  /** La famille, puis ses ancêtres jusqu'à la racine. */
  private async categoryChain(familyId: string): Promise<LineageLink[]> {
    const chain: LineageLink[] = [];
    const seen = new Set<string>();
    let next: string | null = familyId;
    while (next !== null && !seen.has(next) && chain.length < MAX_CATEGORY_DEPTH) {
      seen.add(next);
      const row: CategoryRow | null = await this.prisma.category.findUnique({
        where: { id: next },
        select: { id: true, name: true, parentId: true },
      });
      if (row === null) {
        break;
      }
      chain.push({ id: row.id, label: labelOf(row.name, "category.name") });
      next = row.parentId;
    }
    return chain;
  }

  /** Les taux effectivement appliqués, contexte par contexte. */
  private async appliedRates(
    familyId: string,
    productVat: Readonly<Record<string, string>>,
  ): Promise<LineageLink[]> {
    const familyRows = await this.prisma.categoryContextVat.findMany({
      where: { categoryId: familyId },
      select: { contextId: true, vatRateId: true },
    });
    const applied = [...new Set(Object.values(effectiveVat(byContext(familyRows), productVat)))];
    if (applied.length === 0) {
      return [];
    }
    const rates = await this.prisma.vatRate.findMany({
      where: { id: { in: applied } },
      select: { id: true, name: true },
      orderBy: { percent: "asc" },
    });
    return rates.map((rate) => ({ id: rate.id, label: rate.name }));
  }

  /** Les révisions dont la photo contient une des déclinaisons. */
  private async revisionsHolding(skus: readonly string[]): Promise<RevisionMark[]> {
    if (skus.length === 0) {
      return [];
    }
    const rows = await this.prisma.catalogRevisionItem.findMany({
      where: { sku: { in: [...skus] } },
      distinct: ["revisionId"],
      select: { revision: { select: { id: true, hash: true } } },
    });
    return rows.map((row) => ({ id: row.revision.id, hash: row.revision.hash }));
  }
}

function byContext(
  rows: readonly { readonly contextId: string; readonly vatRateId: string }[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(rows.map((row) => [row.contextId, row.vatRateId]));
}

function labelOf(column: unknown, field: string): string {
  return readLocalizedColumn(column, field)[SOURCE_LOCALE];
}

function uniqueById(links: readonly LineageLink[]): LineageLink[] {
  return [...new Map(links.map((link) => [link.id, link])).values()];
}

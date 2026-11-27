import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type ResupplyOnlyArticle,
  ResupplyOnlyArticlesReader,
} from "../domain/ports/resupply-only-articles.reader.js";
import { servedToResupply } from "../domain/served-to.js";
import { shopItemName, shopSkuOf } from "../domain/shop-sku.js";
import type { CatalogFamilyView } from "@lfd/contracts";

import { familyView } from "../domain/catalog-family.js";
import { saleUnitOf } from "./catalog-sale-unit.js";
import { FLAT_LINEAGE, type Lineage, lineageFrom } from "./catalog-family-lineage.js";
import { timeCatalogueRead } from "./catalogue-read-timing.js";
import { STILL_SOLD } from "./sellable-filter.js";

/** La seule audience que cette lecture rend ; les autres passent par la vitrine. */
const RESUPPLY_ONLY = "resupply";

const ARTICLE_SELECT = {
  sku: true,
  name: true,
  audience: true,
  isDefault: true,
  saleUnit: true,
  customRecipe: true,
  publicReviewPending: true,
  proReviewPending: true,
  category: { select: { id: true, name: true, position: true, slug: true, parentId: true } },
  override: { select: { isHidden: true, isHiddenPublic: true } },
  _count: { select: { reservations: true } },
} as const;

/**
 * **Les articles réservés au réassort**, lus dans le miroir (`catalog_items`).
 *
 * Sur la base et non sur l'instantané du catalogue : l'instantané sert le
 * devis et le rayon, et ces articles n'y paraissent jamais (`lint:catalogue-door`,
 * `ADMITTED`). La requête ne garde que l'audience `resupply` et les articles non
 * retirés ; masquages et réservations se jugent après, par `servedToResupply`.
 */
@Injectable()
export class PrismaResupplyOnlyArticlesReader extends ResupplyOnlyArticlesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async articles(): Promise<readonly ResupplyOnlyArticle[]> {
    const rows = await timeCatalogueRead(() =>
      this.prisma.catalogItem.findMany({
        where: { ...STILL_SOLD, audience: RESUPPLY_ONLY },
        select: ARTICLE_SELECT,
        orderBy: [{ category: { position: "asc" } }, { position: "asc" }, { sku: "asc" }],
      }),
    );
    const lineage = await this.lineage(rows);
    return rows.flatMap((row) => {
      const article = articleOf(row, lineage);
      return article === null ? [] : [article];
    });
  }

  async article(sku: string): Promise<ResupplyOnlyArticle | null> {
    const row = await timeCatalogueRead(() =>
      this.prisma.catalogItem.findFirst({
        where: { ...STILL_SOLD, sku, audience: RESUPPLY_ONLY },
        select: ARTICLE_SELECT,
      }),
    );
    return row === null ? null : articleOf(row, await this.lineage([row]));
  }

  /**
   * La lignée des familles lues, comme `PrismaCatalogReader` la lit : aucune
   * lecture de plus tant qu'aucune famille lue n'a de parente ; sinon le
   * miroir des familles entier, en UNE requête (il ne porte que `parent_id`,
   * et tient en quelques lignes) — jamais une lecture par article.
   */
  private async lineage(rows: readonly ArticleRow[]): Promise<Lineage> {
    if (rows.every((row) => row.category.parentId === null)) {
      return FLAT_LINEAGE;
    }
    const families = await timeCatalogueRead(() =>
      this.prisma.catalogCategory.findMany({
        select: { id: true, parentId: true, name: true, position: true, nameTranslations: true },
      }),
    );
    return lineageFrom(families);
  }
}

/** Une ligne lue, réduite à ce que l'article réservé au réassort porte. */
export interface ArticleRow {
  readonly sku: string;
  readonly name: string;
  readonly audience: string | null;
  readonly isDefault: boolean;
  readonly saleUnit: string;
  readonly customRecipe: boolean;
  readonly publicReviewPending: boolean;
  readonly proReviewPending: boolean;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly position: number;
    readonly slug: string;
    readonly parentId: string | null;
  };
  readonly override: { readonly isHidden: boolean; readonly isHiddenPublic: boolean } | null;
  readonly _count: { readonly reservations: number };
}

/** L'article servi au réassort, ou `null` s'il ne l'est pas (masqué, réservé). */
export function articleOf(row: ArticleRow, lineage: Lineage): ResupplyOnlyArticle | null {
  const served = servedToResupply({
    audience: "resupply",
    isHidden: row.override?.isHidden ?? false,
    isHiddenPublic: row.override?.isHiddenPublic ?? false,
    publicReviewPending: row.publicReviewPending,
    proReviewPending: row.proReviewPending,
    isReserved: row._count.reservations > 0,
    isCustomRecipe: row.customRecipe,
  });
  if (!served) {
    return null;
  }
  return {
    sku: shopSkuOf(row),
    name: shopItemName(row.name),
    categoryId: row.category.id,
    categoryName: row.category.name,
    family: familyOf(row.category, lineage),
    saleUnit: saleUnitOf(row.sku, row.saleUnit),
  };
}

/** La famille servie, parentes comprises quand elle en a — la forme du catalogue des commandes. */
function familyOf(category: ArticleRow["category"], lineage: Lineage): CatalogFamilyView {
  const { path, ancestors } = lineage(category.id);
  return familyView({
    id: category.id,
    name: category.name,
    position: category.position,
    slug: category.slug,
    path,
    ...(ancestors.length === 0 ? {} : { ancestors }),
  });
}

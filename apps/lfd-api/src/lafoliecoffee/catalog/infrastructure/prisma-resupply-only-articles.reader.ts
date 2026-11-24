import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type ResupplyOnlyArticle,
  ResupplyOnlyArticlesReader,
} from "../domain/ports/resupply-only-articles.reader.js";
import { servedToResupply } from "../domain/served-to.js";
import { isShownAsTile, shopItemName, shopSkuOf } from "../domain/shop-sku.js";
import { saleUnitOf } from "./catalog-sale-unit.js";
import { timeCatalogueRead } from "./catalogue-read-timing.js";
import { STILL_SOLD } from "./sellable-filter.js";

/** La seule audience que cette lecture rend ; les autres passent par la vitrine. */
const RESUPPLY_ONLY = "resupply";

const ARTICLE_SELECT = {
  sku: true,
  name: true,
  audience: true,
  isDefault: true,
  variantsAsTiles: true,
  saleUnit: true,
  customRecipe: true,
  publicReviewPending: true,
  proReviewPending: true,
  category: { select: { id: true, name: true } },
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
    return rows.flatMap((row) => {
      const article = articleOf(row);
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
    return row === null ? null : articleOf(row);
  }
}

interface ArticleRow {
  readonly sku: string;
  readonly name: string;
  readonly audience: string | null;
  readonly isDefault: boolean;
  readonly variantsAsTiles: boolean;
  readonly saleUnit: string;
  readonly customRecipe: boolean;
  readonly publicReviewPending: boolean;
  readonly proReviewPending: boolean;
  readonly category: { readonly id: string; readonly name: string };
  readonly override: { readonly isHidden: boolean; readonly isHiddenPublic: boolean } | null;
  readonly _count: { readonly reservations: number };
}

function articleOf(row: ArticleRow): ResupplyOnlyArticle | null {
  const served = servedToResupply({
    audience: "resupply",
    isHidden: row.override?.isHidden ?? false,
    isHiddenPublic: row.override?.isHiddenPublic ?? false,
    publicReviewPending: row.publicReviewPending,
    proReviewPending: row.proReviewPending,
    isReserved: row._count.reservations > 0,
    isCustomRecipe: row.customRecipe,
  });
  if (!served || !isShownAsTile(row)) {
    return null;
  }
  return {
    sku: shopSkuOf(row),
    name: shopItemName(row.name),
    categoryId: row.category.id,
    categoryName: row.category.name,
    saleUnit: saleUnitOf(row.sku, row.saleUnit),
  };
}

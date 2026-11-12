import { Injectable } from "@nestjs/common";
import type { CatalogScreenItemView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { PUBLIC_SALES_CONTEXT } from "../domain/public-context.js";
import {
  CatalogScreenReader,
  type CatalogScreenSource,
} from "../domain/ports/catalog-screen.reader.js";
import { catalogAudienceOf } from "../domain/served-to.js";
import { allergensOf, withPrecaution } from "./prisma-catalog-admin.reader.js";
import {
  publishedEntryRowOf,
  publishedFamilyRowOf,
  publishedItemRowOf,
  type PublishedEntrySourceRow,
  type PublishedFamilySourceRow,
  type PublishedItemSourceRow,
} from "./prisma-published-catalog.reader.js";
import { publicByContextOf } from "./public-by-context.js";
import { STILL_SOLD } from "./sellable-filter.js";

/**
 * Les décisions que l'écran lit — celles de `DECISION_COLUMNS`, SANS l'auteur :
 * l'écran ne l'affiche pas, et le résoudre coûterait une lecture de l'annuaire.
 */
const SCREEN_DECISION_COLUMNS = {
  isHidden: true,
  isHiddenPublic: true,
  isFeaturedPro: true,
  isFeaturedPublic: true,
  decidedAt: true,
} as const;

/** Un article lu dont la famille manque à la lecture des familles. */
export class CatalogScreenFamilyMissingError extends TechnicalError {
  constructor(sku: string, categoryId: string) {
    super(
      "catalog.screen.family_missing",
      `L'article ${sku} cite la famille ${categoryId}, absente de la lecture des familles : ` +
        "le référentiel l'a probablement créée pendant la lecture. Recharger l'écran Catalogue.",
    );
  }
}

/** La ligne d'article lue : ce que la vue publiée et le paramétrage en lisent. */
interface ScreenItemRow extends PublishedItemSourceRow {
  readonly allergens: unknown;
  readonly allergenLabels: unknown;
  readonly allergensPrecautionary: boolean;
  readonly operationOnly: boolean;
  readonly customRecipe: boolean;
  readonly override: {
    readonly isHidden: boolean;
    readonly isHiddenPublic: boolean;
    readonly isFeaturedPro: boolean;
    readonly isFeaturedPublic: boolean;
    readonly decidedAt: Date;
  } | null;
}

/**
 * L'écran Catalogue en une lecture par table (`le-cache-du-back-office.md`,
 * § 4.1) : les articles en vente (décisions jointes, une requête de plus par
 * Prisma), les fiches reçues, les familles. Ni `include` de la famille — son
 * nom vient de la lecture des familles —, ni compte des réservations, ni
 * auteurs.
 */
@Injectable()
export class PrismaCatalogScreenReader extends CatalogScreenReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<CatalogScreenSource> {
    const [entries, items, families] = await Promise.all([
      this.prisma.catalogEntry.findMany({ orderBy: [{ name: "asc" }, { productId: "asc" }] }),
      this.items([]),
      this.families(),
    ]);
    return sourceOf(entries, items, families);
  }

  async readProductsOf(skus: readonly string[]): Promise<CatalogScreenSource> {
    const touched = await this.prisma.catalogItem.findMany({
      where: { ...STILL_SOLD, sku: { in: [...skus] } },
      select: { productId: true },
    });
    const productIds = [...new Set(touched.map((item) => item.productId))];
    if (productIds.length === 0) {
      return { published: { entries: [], items: [], families: [] }, items: [] };
    }
    const [entries, items, families] = await Promise.all([
      this.prisma.catalogEntry.findMany({
        where: { productId: { in: productIds } },
        orderBy: [{ name: "asc" }, { productId: "asc" }],
      }),
      this.items(productIds),
      this.families(),
    ]);
    return sourceOf(entries, items, families);
  }

  /** Les articles en vente — de ces fiches seulement si la liste n'est pas vide. */
  private items(productIds: readonly string[]): Promise<ScreenItemRow[]> {
    return this.prisma.catalogItem.findMany({
      where: {
        ...STILL_SOLD,
        ...(productIds.length === 0 ? {} : { productId: { in: [...productIds] } }),
      },
      include: { override: { select: SCREEN_DECISION_COLUMNS } },
      orderBy: [{ position: "asc" }, { sku: "asc" }],
    });
  }

  private families(): Promise<PublishedFamilySourceRow[]> {
    return this.prisma.catalogCategory.findMany({
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
  }
}

function sourceOf(
  entries: readonly PublishedEntrySourceRow[],
  items: readonly ScreenItemRow[],
  families: readonly PublishedFamilySourceRow[],
): CatalogScreenSource {
  const familyOf = new Map(families.map((family) => [family.id, family]));
  return {
    published: {
      entries: entries.map(publishedEntryRowOf),
      items: items.map(publishedItemRowOf),
      families: families.map(publishedFamilyRowOf),
    },
    items: [...items]
      .sort((a, b) => familyPosition(familyOf, a) - familyPosition(familyOf, b))
      .map((item) => screenItemOf(item, familyNameOf(familyOf, item))),
  };
}

/**
 * Le nom de la famille d'un article. La clé étrangère la garantit ; seule une
 * famille créée entre les deux lectures parallèles peut manquer — l'écran se
 * relit, on n'invente pas de nom.
 */
function familyNameOf(
  familyOf: ReadonlyMap<string, PublishedFamilySourceRow>,
  item: ScreenItemRow,
): string {
  const family = familyOf.get(item.categoryId);
  if (family === undefined) {
    throw new CatalogScreenFamilyMissingError(item.sku, item.categoryId);
  }
  return family.name;
}

/**
 * Le rang d'un article au paramétrage : la position de sa famille, puis
 * l'ordre de la lecture (position, SKU) — le tri est stable. L'ordre de
 * `GET admin/catalog`, sans sa jointure.
 */
function familyPosition(
  familyOf: ReadonlyMap<string, PublishedFamilySourceRow>,
  item: ScreenItemRow,
): number {
  return familyOf.get(item.categoryId)?.position ?? Number.MAX_SAFE_INTEGER;
}

/** La ligne de paramétrage, comme `PrismaCatalogAdminReader` la rend, auteurs et réservations en moins. */
function screenItemOf(row: ScreenItemRow, categoryName: string): CatalogScreenItemView {
  return {
    sku: row.sku,
    productId: row.productId,
    productSku: row.productSku,
    name: row.name,
    categoryId: row.categoryId,
    categoryName,
    pimPriceMillicents: row.priceMillicents,
    vatRatePercent: row.vatRatePercent?.toNumber() ?? null,
    publicTtcCents: row.publicTtcCents,
    publicVatRatePercent:
      publicByContextOf(row.publicByContext)?.[PUBLIC_SALES_CONTEXT]?.vatRatePercent ?? null,
    ...withPrecaution(allergensOf(row.allergens, row.allergenLabels), row.allergensPrecautionary),
    isHidden: row.override?.isHidden ?? false,
    isHiddenPublic: row.override?.isHiddenPublic ?? false,
    audience: catalogAudienceOf(row.audience),
    publicReviewPending: row.publicReviewPending,
    proReviewPending: row.proReviewPending,
    isFeaturedPro: row.override?.isFeaturedPro ?? false,
    isFeaturedPublic: row.override?.isFeaturedPublic ?? false,
    isCustomRecipe: row.customRecipe,
    operationOnly: row.operationOnly,
    decidedAt: row.override?.decidedAt.toISOString() ?? null,
    receivedAt: row.receivedAt.toISOString(),
  };
}

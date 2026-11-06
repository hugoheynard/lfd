import type { PrismaService } from "../../../../platform/database/prisma.service.js";
import { timeCatalogueRead } from "../catalogue-read-timing.js";
import { CATALOGUE_SNAPSHOT_COLUMNS } from "../catalogue-snapshot-columns.js";
import { FLAT_LINEAGE, lineageFrom, type Lineage } from "../catalog-family-lineage.js";
import { STILL_SOLD } from "../sellable-filter.js";
import { GENERAL_ORDER_CUTOFF_WHERE } from "../../../order-cutoffs/infrastructure/general-order-cutoff.row.js";

/**
 * Un `select` Prisma tiré d'une liste de colonnes — celles de
 * `CATALOGUE_SNAPSHOT_COLUMNS`, et elles seules : ce que le chargeur lit est
 * exactement ce qui fait monter les numéros (§ 2.2, § 3). Une colonne lue
 * hors de la constante serait servie sans que rien ne la rafraîchisse.
 */
function selectOf<K extends string>(columns: readonly K[]): { readonly [P in K]: true } {
  return Object.fromEntries(columns.map((column) => [column, true])) as { [P in K]: true };
}

const COLUMNS = CATALOGUE_SNAPSHOT_COLUMNS;

/** Ce que l'instantané lit d'un article : la constante, la famille, la dérogation, le compteur. */
const ARTICLE_SELECT = {
  ...selectOf(COLUMNS.catalog.catalog_items),
  category: { select: selectOf(COLUMNS.catalog.catalog_categories) },
  override: { select: selectOf(COLUMNS.catalog.catalog_item_overrides) },
  // « Est-il réservé ? » — un nombre, le même pour tous, sans aucune société
  // (option (a), § 2.1). « À qui parmi TES sociétés » reste lu par requête.
  _count: { select: { reservations: true } },
} as const;

/** Les colonnes de l'heure limite générale, et elles seules. */
const CUTOFF_SELECT = selectOf(COLUMNS.order_cutoffs.order_cutoffs);

/** La forme d'un article de l'instantané, telle que Prisma la rend. */
export type SnapshotArticleRow = Awaited<ReturnType<typeof readArticleRows>>[number];

/** L'heure limite générale de l'instantané, ou `null` tant que personne ne l'a posée. */
export type SnapshotGeneralCutoff = Awaited<ReturnType<typeof loadGeneralCutoff>>;

/**
 * **Le morceau `catalog`** : les articles ENCORE VENDUS, rangés dans l'ordre
 * du rayon, indexés par SKU, et la lignée des familles.
 */
export interface SnapshotArticles {
  /** Famille, position, SKU — l'ordre de `listSellable` (§ 9). */
  readonly rows: readonly SnapshotArticleRow[];
  readonly bySku: ReadonlyMap<string, SnapshotArticleRow>;
  readonly lineage: Lineage;
}

function readArticleRows(prisma: PrismaService) {
  return timeCatalogueRead(() =>
    prisma.catalogItem.findMany({
      // 🔴 `STILL_SOLD`, importé : un article retiré est absent de l'instantané
      // comme de la lecture B, donc aucune vue ne peut le chiffrer (§ 2.1).
      where: STILL_SOLD,
      select: ARTICLE_SELECT,
    }),
  );
}

/** Charge le morceau `catalog` — un appel, plus un pour la lignée si une famille a une parente. */
export async function loadArticles(prisma: PrismaService): Promise<SnapshotArticles> {
  const rows = [...(await readArticleRows(prisma))].sort(byShelfOrder);
  const nested = rows.some((row) => row.category.parentId !== null);
  const lineage = nested ? lineageFrom(await readFamilies(prisma)) : FLAT_LINEAGE;
  return Object.freeze({
    rows: Object.freeze(rows),
    bySku: new Map(rows.map((row) => [row.sku, row])),
    lineage,
  });
}

function readFamilies(prisma: PrismaService) {
  return timeCatalogueRead(() =>
    prisma.catalogCategory.findMany({
      select: selectOf(COLUMNS.catalog.catalog_categories),
    }),
  );
}

/**
 * **Le tri à trois clés** de la lecture A (`prisma-catalog.reader.ts`,
 * `listSellable`) : la position de la famille, celle de l'article, puis le
 * SKU, qui départage (le référentiel envoie `position: 0` partout).
 *
 * ⚠️ Le SKU se compare ici en unités de code, là où Postgres applique la
 * collation de la base : deux SKU qui ne diffèrent que par la ponctuation
 * peuvent s'ordonner autrement. L'ordre reste total et stable.
 */
function byShelfOrder(left: SnapshotArticleRow, right: SnapshotArticleRow): number {
  return (
    left.category.position - right.category.position ||
    left.position - right.position ||
    (left.sku < right.sku ? -1 : left.sku > right.sku ? 1 : 0)
  );
}

/** Charge le morceau `order_cutoffs` : l'heure limite générale. */
export function loadGeneralCutoff(prisma: PrismaService) {
  return timeCatalogueRead(() =>
    prisma.orderCutoff.findFirst({ where: GENERAL_ORDER_CUTOFF_WHERE, select: CUTOFF_SELECT }),
  );
}

/** Les trois numéros, en une lecture ; un contexte sans ligne est absent. */
export async function readContextVersions(
  prisma: PrismaService,
): Promise<ReadonlyMap<string, bigint>> {
  const rows = await timeCatalogueRead(() =>
    prisma.contextVersion.findMany({ select: { context: true, value: true } }),
  );
  return new Map(rows.map((row) => [row.context, row.value]));
}

/**
 * **Les réservations de l'appelant**, filtrées par SES sociétés en SQL — le
 * mur entre sociétés reste dans la requête (option (a), § 2.1). Aucun appel
 * pour un lecteur sans société.
 */
export async function readReservations(
  prisma: PrismaService,
  holderIds: readonly string[],
): Promise<ReadonlyMap<string, readonly { readonly companyId: string }[]>> {
  if (holderIds.length === 0) {
    return new Map();
  }
  const rows = await timeCatalogueRead(() =>
    prisma.catalogItemReservation.findMany({
      where: { companyId: { in: [...holderIds] } },
      select: { sku: true, companyId: true },
    }),
  );
  const bySku = new Map<string, { readonly companyId: string }[]>();
  for (const row of rows) {
    bySku.set(row.sku, [...(bySku.get(row.sku) ?? []), { companyId: row.companyId }]);
  }
  return bySku;
}

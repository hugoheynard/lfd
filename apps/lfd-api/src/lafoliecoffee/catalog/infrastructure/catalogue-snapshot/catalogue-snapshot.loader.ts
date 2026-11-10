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
  /** Famille, position, SKU — l'ordre de `listSellable` (§ 9), tranché par Postgres. */
  readonly rows: readonly SnapshotArticleRow[];
  readonly bySku: ReadonlyMap<string, SnapshotArticleRow>;
  readonly lineage: Lineage;
}

/**
 * **L'ordre du rayon, tranché par Postgres** — le tri à trois clés de la
 * lecture A (`prisma-catalog.reader.ts`, `listSellable`) : la position de la
 * famille, celle de l'article, puis le SKU, qui départage (le référentiel
 * envoie `position: 0` partout).
 *
 * Demandé à la base plutôt que refait en mémoire (lot M2, § 12) : le SKU s'y
 * compare selon la collation de la base, et un tri en unités de code pouvait
 * ordonner autrement deux SKU qui ne diffèrent que par la ponctuation. Le
 * rayon lu dans l'instantané a donc l'ordre du rayon lu en base, quelle que
 * soit la collation de l'environnement.
 */
export const SHELF_ORDER = [
  { category: { position: "asc" } },
  { position: "asc" },
  { sku: "asc" },
] as const;

function readArticleRows(prisma: PrismaService) {
  return timeCatalogueRead(() =>
    prisma.catalogItem.findMany({
      // 🔴 `STILL_SOLD`, importé : un article retiré est absent de l'instantané
      // comme de la lecture B, donc aucune vue ne peut le chiffrer (§ 2.1).
      where: STILL_SOLD,
      select: ARTICLE_SELECT,
      orderBy: [...SHELF_ORDER],
    }),
  );
}

/** Charge le morceau `catalog` — un appel, plus un pour la lignée si une famille a une parente. */
export async function loadArticles(prisma: PrismaService): Promise<SnapshotArticles> {
  const rows = await readArticleRows(prisma);
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

/** Charge le morceau `order_cutoffs` : l'heure limite générale. */
export function loadGeneralCutoff(prisma: PrismaService) {
  return timeCatalogueRead(() =>
    prisma.orderCutoff.findFirst({ where: GENERAL_ORDER_CUTOFF_WHERE, select: CUTOFF_SELECT }),
  );
}

/** Les colonnes d'une opération, et ses articles dans l'ordre du rayon. */
const OPERATION_SELECT = {
  ...selectOf(COLUMNS.operations.catalog_operations),
  items: { select: { sku: true }, orderBy: { position: "asc" } },
} as const;

/** Une opération de l'instantané, telle que Prisma la rend. */
export type SnapshotOperationRow = Awaited<ReturnType<typeof readOperationRows>>[number];

/**
 * **Le morceau `operations`** (lot M2) : les opérations NON RETIRÉES, avec
 * leurs articles, dans l'ordre de `PrismaCatalogOperationsReader` — la plus
 * récemment annoncée d'abord, la clé départage. Le jugement (masquée, sans
 * clientèle, fenêtre) se fait à la lecture, à l'instant de la requête.
 */
export interface SnapshotOperations {
  readonly rows: readonly SnapshotOperationRow[];
}

function readOperationRows(prisma: PrismaService) {
  return timeCatalogueRead(() =>
    prisma.catalogOperation.findMany({
      where: { withdrawnAt: null },
      select: OPERATION_SELECT,
      // L'ordre tranché par Postgres, comme celui des articles : la clé se
      // compare selon la collation de la base.
      orderBy: [{ announceFrom: "desc" }, { key: "asc" }],
    }),
  );
}

/** Charge le morceau `operations` — un appel, ses articles en `include`. */
export async function loadOperations(prisma: PrismaService): Promise<SnapshotOperations> {
  const rows = await readOperationRows(prisma);
  return Object.freeze({ rows: Object.freeze(rows) });
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

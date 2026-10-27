import { Prisma } from "../../../platform/database/client/client.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";
import type { pimFactsColumns } from "./catalog-item-columns.js";

/** Les colonnes de faits, telles que `pimFactsColumns` les rend. */
type FactsColumn = keyof ReturnType<typeof pimFactsColumns>;

/** Toute colonne de `catalog_items` qu'un upsert en lot sait écrire. */
export type ItemColumn =
  | FactsColumn
  | "sku"
  | "withdrawnAt"
  | "publicReviewPending"
  | "proReviewPending"
  | "audience"
  | "variantId"
  | "nameTranslations"
  | "noteTranslations";

/** Une ligne à écrire : ses colonnes, sous leur nom de modèle. */
export type ItemUpsertRow = Readonly<Partial<Record<ItemColumn, unknown>>> & {
  readonly sku: string;
};

/**
 * Le nom SQL de chaque colonne.
 *
 * 🔴 `satisfies Record<ItemColumn, …>` est la garde qui remplace l'étalement
 * de l'ancien `upsert` Prisma : un champ ajouté à `pimFactsColumns` sans nom
 * SQL ici ne compile pas. Sans elle, il ne serait jamais écrit, en silence.
 * Ces noms sont des constantes : aucune donnée n'entre dans le texte SQL.
 */
const SQL_NAMES = {
  sku: "sku",
  productId: "product_id",
  productSku: "product_sku",
  name: "name",
  kind: "kind",
  categoryId: "category_id",
  priceMillicents: "price_millicents",
  weightGrams: "weight_grams",
  isDefault: "is_default",
  position: "position",
  vatRatePercent: "vat_rate_percent",
  allergens: "allergens",
  note: "note",
  imageUrl: "image_url",
  imageAlt: "image_alt",
  imageWidth: "image_width",
  imageHeight: "image_height",
  imageFocalX: "image_focal_x",
  imageFocalY: "image_focal_y",
  thumbnailUrl: "thumbnail_url",
  thumbnailAlt: "thumbnail_alt",
  thumbnailWidth: "thumbnail_width",
  thumbnailHeight: "thumbnail_height",
  thumbnailFocalX: "thumbnail_focal_x",
  thumbnailFocalY: "thumbnail_focal_y",
  orderLimitDaysBefore: "order_limit_days_before",
  orderLimitTime: "order_limit_time",
  orderLimitGraceMinutes: "order_limit_grace_minutes",
  publicTtcCents: "public_ttc_cents",
  publicByContext: "public_by_context",
  allergenLabels: "allergen_labels",
  mayContain: "may_contain",
  allergensPrecautionary: "allergens_precautionary",
  allergenTexts: "allergen_texts",
  operationOnly: "operation_only",
  requiresCold: "requires_cold",
  receivedAt: "received_at",
  withdrawnAt: "withdrawn_at",
  publicReviewPending: "public_review_pending",
  proReviewPending: "pro_review_pending",
  audience: "audience",
  variantId: "variant_id",
  nameTranslations: "name_translations",
  noteTranslations: "note_translations",
} as const satisfies Record<ItemColumn, string>;

/** Les colonnes `jsonb` : leur valeur part sérialisée, et castée. */
const JSON_COLUMNS: ReadonlySet<ItemColumn> = new Set([
  "allergens",
  "publicByContext",
  "allergenLabels",
  "mayContain",
  "allergenTexts",
  "nameTranslations",
  "noteTranslations",
]);

/**
 * Au plus tant de lignes par instruction : 44 colonnes × 1 000 restent loin
 * de la borne des 65 535 paramètres d'une requête Postgres.
 */
export const UPSERT_CHUNK = 1_000;

function isItemColumn(key: string): key is ItemColumn {
  return key in SQL_NAMES;
}

function identifier(column: ItemColumn): Prisma.Sql {
  return Prisma.raw(`"${SQL_NAMES[column]}"`);
}

/** Une valeur, paramétrée ; `Prisma.DbNull` (l'absence d'un `jsonb`) devient `NULL`. */
function valueOf(column: ItemColumn, value: unknown): Prisma.Sql {
  if (value === null || value === undefined || value === Prisma.DbNull) {
    return Prisma.sql`NULL`;
  }
  return JSON_COLUMNS.has(column)
    ? Prisma.sql`${JSON.stringify(value)}::jsonb`
    : Prisma.sql`${value}`;
}

/** Un SKU cité deux fois ne s'écrit qu'une — la dernière, comme la boucle d'avant. */
function lastPerSku(rows: readonly ItemUpsertRow[]): ItemUpsertRow[] {
  return [...new Map(rows.map((row) => [row.sku, row])).values()];
}

/**
 * Les instructions d'un upsert en lot : `INSERT … ON CONFLICT (sku) DO UPDATE`,
 * une par tranche de {@link UPSERT_CHUNK} lignes, toutes valeurs paramétrées.
 *
 * Les colonnes insérées sont celles de la première ligne — un lot est bâti
 * par une seule fonction, toutes ses lignes ont les mêmes. `createOnly` nomme
 * celles qu'un conflit ne réécrit PAS (l'attente de validation posée à la
 * création, par exemple).
 */
export function itemUpsertStatements(
  rows: readonly ItemUpsertRow[],
  createOnly: readonly ItemColumn[] = [],
): Prisma.Sql[] {
  const unique = lastPerSku(rows);
  const [first] = unique;
  if (first === undefined) {
    return [];
  }
  const columns = Object.keys(first).filter(isItemColumn);
  const updated = columns.filter((column) => column !== "sku" && !createOnly.includes(column));
  const set = Prisma.join(
    updated.map((column) => Prisma.sql`${identifier(column)} = EXCLUDED.${identifier(column)}`),
  );
  const statements: Prisma.Sql[] = [];
  for (let start = 0; start < unique.length; start += UPSERT_CHUNK) {
    const values = unique
      .slice(start, start + UPSERT_CHUNK)
      .map((row) => Prisma.sql`(${Prisma.join(columns.map((c) => valueOf(c, row[c])))})`);
    statements.push(Prisma.sql`
      INSERT INTO public.catalog_items (${Prisma.join(columns.map(identifier))})
      VALUES ${Prisma.join(values)}
      ON CONFLICT (sku) DO UPDATE SET ${set}`);
  }
  return statements;
}

/**
 * Écrit des articles en lot — **un aller-retour par tranche** de
 * {@link UPSERT_CHUNK}, quel que soit le nombre d'articles en deçà. Un
 * `upsert` par article faisait croître la transaction interactive avec le
 * lot, ce qui l'a fait expirer en production (P2028, 2026-10-17).
 */
export async function upsertCatalogItems(
  db: Pick<PrismaService, "$executeRaw">,
  rows: readonly ItemUpsertRow[],
  createOnly: readonly ItemColumn[] = [],
): Promise<void> {
  for (const statement of itemUpsertStatements(rows, createOnly)) {
    await db.$executeRaw(statement);
  }
}

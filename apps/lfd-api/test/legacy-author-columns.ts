/**
 * Les **anciennes colonnes d'auteur** (`*_by_sub`, `staff_sub`), lues par SQL
 * brut — plan `documentation/staff/plan-l-auteur-est-la-fiche.md`, étape 5B.
 *
 * Depuis 5B, le schéma Prisma ne les connaît plus : elles restent en base
 * jusqu'à 5C, et seul le SQL les voit encore. Ce que les suites en disent est
 * justement ce que Prisma ne peut plus dire — qu'une ligne neuve ne les écrit
 * pas (NULL), et que les migrations 5A/5B les lisent bien.
 *
 * Les noms de table et de colonne viennent d'une liste fermée, jamais de
 * l'appelant : la requête n'interpole que la valeur de la clé, en paramètre.
 */
import type { PrismaService } from "../src/platform/database/prisma.service.js";

const LEGACY_AUTHOR_COLUMNS = {
  "companies.activated_by_sub": { table: "companies", column: "activated_by_sub", key: "id" },
  "companies.kbis_certified_by_sub": {
    table: "companies",
    column: "kbis_certified_by_sub",
    key: "id",
  },
  "client_notes.created_by_sub": { table: "client_notes", column: "created_by_sub", key: "id" },
  "delivery_settings.updated_by_sub": {
    table: "delivery_settings",
    column: "updated_by_sub",
    key: "key",
  },
  "feature_access_exemptions.created_by_sub": {
    table: "feature_access_exemptions",
    column: "created_by_sub",
    key: "id",
  },
  "feature_access_overrides.updated_by_sub": {
    table: "feature_access_overrides",
    column: "updated_by_sub",
    key: "key",
  },
  "staff_push_subscriptions.staff_sub": {
    table: "staff_push_subscriptions",
    column: "staff_sub",
    key: "id",
  },
} as const;

export type LegacyAuthorColumn = keyof typeof LEGACY_AUTHOR_COLUMNS;

/**
 * La valeur de l'ancienne colonne sur UNE ligne, désignée par sa clé.
 * Échoue si la ligne n'existe pas : un `null` ne doit vouloir dire qu'une
 * chose, « la colonne est vide ».
 */
export async function legacyAuthorOf(
  prisma: PrismaService,
  which: LegacyAuthorColumn,
  keyValue: string,
): Promise<string | null> {
  const { table, column, key } = LEGACY_AUTHOR_COLUMNS[which];
  const rows = await prisma.$queryRawUnsafe<readonly { readonly value: string | null }[]>(
    `SELECT "${column}" AS value FROM "public"."${table}" WHERE "${key}" = $1`,
    keyValue,
  );
  const [row] = rows;
  if (rows.length !== 1 || row === undefined) {
    throw new Error(`Aucune ligne ${table}.${key} = ${keyValue} : l'assertion viserait le vide.`);
  }
  return row.value;
}

/**
 * La scène de la migration qui **resserre les colonnes d'auteur** — plan
 * `documentation/staff/plan-l-auteur-est-la-fiche.md`, étape 5C.
 *
 * 🔴 La base de test est migrée JUSQU'AU BOUT : les anciennes colonnes
 * (`*_by_sub`, `staff_sub`) n'y existent plus, et les nouvelles sont déjà
 * NOT NULL. Pour éprouver la migration, la scène **reconstitue l'état que 5B
 * laisse en production** — anciennes colonnes présentes et nullables, leur
 * index, nouvelles colonnes nullables — dans une transaction que la suite
 * annule. Le SQL éprouvé, lui, est celui du fichier de migration, pas une
 * copie.
 *
 * Tout s'écrit en SQL brut, et c'est le seul moyen : le schéma Prisma ne
 * connaît plus les anciennes colonnes, et aucun chemin du domaine n'écrit une
 * ligne « forme ancienne ».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { daysAgo, E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";

/** Une valeur qu'une ligne portait DÉJÀ dans sa jumelle : la recopie la laisse. */
export const ALREADY_THERE = "fiche-deja-ecrite";

/** Ce qu'une transaction Prisma sait faire, et tout ce dont la scène a besoin. */
export type RawSql = Pick<E2eContext["prisma"], "$executeRaw" | "$executeRawUnsafe" | "$queryRaw">;

const NOTEBOOK_ID = "carnet-1";
const NOTE_ID = "note-1";
const EXEMPTION_ID = "exemption-1";
const SUBSCRIPTION_ID = "abonnement-1";

/**
 * Les instructions d'une migration, dans l'ordre : commentaires `--` retirés,
 * découpées sur le `;` de fin de ligne. On éprouve CE SQL-là, pas une copie.
 */
export function migrationStatements(folder: string, expected: number): readonly string[] {
  const statements = readFileSync(
    join(process.cwd(), "prisma/migrations", folder, "migration.sql"),
    "utf8",
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  if (statements.length !== expected) {
    throw new Error(
      `${folder} ne porte plus ${String(expected)} instruction(s) (${String(statements.length)}) : relire le fichier.`,
    );
  }
  return statements;
}

/** Les sept anciennes colonnes, avec leur jumelle. */
export const AUTHOR_PAIRS = [
  { table: "feature_access_overrides", old: "updated_by_sub", new: "updated_by_staff_id" },
  { table: "feature_access_exemptions", old: "created_by_sub", new: "created_by_staff_id" },
  { table: "delivery_settings", old: "updated_by_sub", new: "updated_by_staff_id" },
  { table: "client_notes", old: "created_by_sub", new: "created_by_staff_id" },
  { table: "companies", old: "kbis_certified_by_sub", new: "kbis_certified_by_staff_id" },
  { table: "companies", old: "activated_by_sub", new: "activated_by_staff_id" },
  { table: "staff_push_subscriptions", old: "staff_sub", new: "staff_user_id" },
] as const;

/** Les tables dont l'ancienne colonne était NOT NULL à sa création. */
export const TIGHTENED_TABLES: ReadonlySet<string> = new Set([
  "feature_access_overrides",
  "feature_access_exemptions",
  "delivery_settings",
  "client_notes",
  "staff_push_subscriptions",
]);

/**
 * Remet la base dans l'état que 5B laisse : l'inverse exact de ce que 5C
 * resserre et supprime. Les noms viennent de la liste fermée ci-dessus.
 */
export async function reconstituteStateAfter5B(tx: RawSql): Promise<void> {
  for (const pair of AUTHOR_PAIRS) {
    await tx.$executeRawUnsafe(
      `ALTER TABLE "public"."${pair.table}" ADD COLUMN "${pair.old}" TEXT`,
    );
    if (TIGHTENED_TABLES.has(pair.table)) {
      await tx.$executeRawUnsafe(
        `ALTER TABLE "public"."${pair.table}" ALTER COLUMN "${pair.new}" DROP NOT NULL`,
      );
    }
  }
  await tx.$executeRawUnsafe(
    `CREATE INDEX "staff_push_subscriptions_staff_sub_idx" ON "public"."staff_push_subscriptions"("staff_sub")`,
  );
}

/**
 * Une ligne par paire. Six ne portent que l'ancienne colonne (ce qu'un code
 * d'avant 5A écrivait) ; l'activation porte en plus une jumelle déjà remplie,
 * et le KBIS, jamais certifié, deux nuls.
 */
export async function seedOldForm(tx: RawSql, companyId: string): Promise<void> {
  const at = new Date(daysAgo(2));
  await tx.$executeRaw`
    INSERT INTO "public"."feature_access_overrides"
      ("key", "value", "updated_at", "updated_by_sub", "updated_by_name", "updated_by_role")
    VALUES ('shop', 'browse', ${at}, ${E2E_STAFF_ID}, 'Opérateur E2E', 'admin')`;
  await tx.$executeRaw`
    INSERT INTO "public"."feature_access_exemptions"
      ("id", "key", "email", "created_at", "created_by_sub", "created_by_name", "created_by_role")
    VALUES (${EXEMPTION_ID}, 'shop', 'testeur@exemple.fr', ${at}, ${E2E_STAFF_ID}, 'Opérateur E2E', 'admin')`;
  await tx.$executeRaw`
    INSERT INTO "public"."delivery_settings"
      ("key", "open_to_b2b", "open_to_b2c", "updated_at", "updated_by_sub", "updated_by_name", "updated_by_role")
    VALUES ('delivery', true, false, ${at}, ${E2E_STAFF_ID}, 'Opérateur E2E', 'admin')`;
  await tx.$executeRaw`
    INSERT INTO "public"."staff_push_subscriptions" ("id", "endpoint", "p256dh", "auth", "staff_sub")
    VALUES (${SUBSCRIPTION_ID}, 'https://push.exemple.test/1', 'cle-publique', 'secret', ${E2E_STAFF_ID})`;
  await tx.$executeRaw`
    UPDATE "public"."companies"
    SET "activated_at" = ${new Date(daysAgo(3))}, "activated_by_sub" = ${E2E_STAFF_ID},
        "activated_by_staff_id" = ${ALREADY_THERE}
    WHERE "id" = ${companyId}`;
  await tx.$executeRaw`
    INSERT INTO "public"."client_notebooks" ("id", "company_id", "updated_at")
    VALUES (${NOTEBOOK_ID}, ${companyId}, ${at})`;
  await tx.$executeRaw`
    INSERT INTO "public"."client_notes"
      ("id", "notebook_id", "position", "title", "created_by_sub", "created_by_name", "updated_at")
    VALUES (${NOTE_ID}, ${NOTEBOOK_ID}, 0, 'Livrer par la cour', ${E2E_STAFF_ID}, 'Opérateur E2E', ${at})`;
}

/** La valeur de la NOUVELLE colonne de chaque paire, dans un ordre fixe. */
export interface NewAuthor {
  readonly pair: string;
  readonly value: string | null;
}

/** Relit les sept nouvelles colonnes — les seules qui restent après 5C. */
export async function newAuthors(tx: RawSql, companyId: string): Promise<readonly NewAuthor[]> {
  return tx.$queryRaw<NewAuthor[]>`
    SELECT 'overrides' AS pair, "updated_by_staff_id" AS value
      FROM "public"."feature_access_overrides" WHERE "key" = 'shop'
    UNION ALL
    SELECT 'exemptions', "created_by_staff_id"
      FROM "public"."feature_access_exemptions" WHERE "id" = ${EXEMPTION_ID}
    UNION ALL
    SELECT 'delivery', "updated_by_staff_id"
      FROM "public"."delivery_settings" WHERE "key" = 'delivery'
    UNION ALL
    SELECT 'notes', "created_by_staff_id"
      FROM "public"."client_notes" WHERE "id" = ${NOTE_ID}
    UNION ALL
    SELECT 'push', "staff_user_id"
      FROM "public"."staff_push_subscriptions" WHERE "id" = ${SUBSCRIPTION_ID}
    UNION ALL
    SELECT 'activation', "activated_by_staff_id"
      FROM "public"."companies" WHERE "id" = ${companyId}
    UNION ALL
    SELECT 'kbis', "kbis_certified_by_staff_id"
      FROM "public"."companies" WHERE "id" = ${companyId}`;
}

/** Ce que doit donner la recopie : tout recopié, sauf ce qui était déjà là. */
export const COPIED: readonly NewAuthor[] = [
  { pair: "overrides", value: E2E_STAFF_ID },
  { pair: "exemptions", value: E2E_STAFF_ID },
  { pair: "delivery", value: E2E_STAFF_ID },
  { pair: "notes", value: E2E_STAFF_ID },
  { pair: "push", value: E2E_STAFF_ID },
  { pair: "activation", value: ALREADY_THERE },
  { pair: "kbis", value: null },
];

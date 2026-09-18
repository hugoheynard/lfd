/**
 * La scène des migrations de **colonnes d'auteur** — plan
 * `documentation/staff/plan-l-auteur-est-la-fiche.md`, étapes 5A et 5B.
 *
 * Partagée par `staff-author-columns` (la recopie de 5A) et
 * `staff-author-switch` (la recopie et le relâchement de 5B) : les deux
 * éprouvent un SQL de migration sur les mêmes sept paires de colonnes.
 *
 * 🔴 Tout s'écrit ici en SQL brut, et c'est le seul moyen : depuis 5B, le
 * schéma Prisma ne connaît plus les anciennes colonnes, et aucun chemin du
 * domaine n'écrit plus de ligne « forme ancienne ». Ce que la production
 * contient et que le code ne peut plus produire ne se sème que par la base.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { daysAgo, E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** Une valeur qu'une ligne portait DÉJÀ dans sa jumelle : la recopie la laisse. */
export const ALREADY_THERE = "fiche-deja-ecrite";

/** Les clés des lignes semées, pour les relire. */
export interface SeededRows {
  readonly companyId: string;
}

type Prisma = E2eContext["prisma"];

const NOTEBOOK_ID = "carnet-1";
const NOTE_ID = "note-1";
const EXEMPTION_ID = "exemption-1";
const SUBSCRIPTION_ID = "abonnement-1";

/**
 * Les instructions d'une migration, commentaires `--` retirés, découpées sur
 * le `;` de fin de ligne, et filtrées par leur premier mot. On éprouve CE
 * SQL-là, pas une copie.
 */
export function migrationStatements(
  folder: string,
  verb: "UPDATE" | "ALTER",
  expected: number,
): readonly string[] {
  const statements = readFileSync(
    join(process.cwd(), "prisma/migrations", folder, "migration.sql"),
    "utf8",
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.startsWith(verb));
  if (statements.length !== expected) {
    throw new Error(
      `${folder} ne porte plus ${expected} instruction(s) ${verb} (${statements.length}) : relire le fichier.`,
    );
  }
  return statements;
}

/** Joue des instructions dans UNE transaction, comme `migrate deploy`. */
export async function runStatements(prisma: Prisma, statements: readonly string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
  });
}

/**
 * Une ligne par paire de colonnes. Six ne portent que l'ancienne (ce qu'une
 * instance d'avant 5A écrivait) ; la société porte en plus une jumelle déjà
 * remplie, et un KBIS jamais certifié — deux nuls.
 */
export async function seedOldForm(prisma: Prisma): Promise<SeededRows> {
  const at = new Date(daysAgo(2));
  await prisma.$executeRaw`
    INSERT INTO "public"."feature_access_overrides"
      ("key", "value", "updated_at", "updated_by_sub", "updated_by_name", "updated_by_role")
    VALUES ('shop', 'browse', ${at}, ${E2E_STAFF_ID}, 'Opérateur E2E', 'admin')`;
  await prisma.$executeRaw`
    INSERT INTO "public"."feature_access_exemptions"
      ("id", "key", "email", "created_at", "created_by_sub", "created_by_name", "created_by_role")
    VALUES (${EXEMPTION_ID}, 'shop', 'testeur@exemple.fr', ${at}, ${E2E_STAFF_ID}, 'Opérateur E2E', 'admin')`;
  await prisma.$executeRaw`
    INSERT INTO "public"."delivery_settings"
      ("key", "open_to_b2b", "open_to_b2c", "updated_at", "updated_by_sub", "updated_by_name", "updated_by_role")
    VALUES ('delivery', true, false, ${at}, ${E2E_STAFF_ID}, 'Opérateur E2E', 'admin')`;
  await prisma.$executeRaw`
    INSERT INTO "public"."staff_push_subscriptions" ("id", "endpoint", "p256dh", "auth", "staff_sub")
    VALUES (${SUBSCRIPTION_ID}, 'https://push.exemple.test/1', 'cle-publique', 'secret', ${E2E_STAFF_ID})`;
  const company = await createCompany(prisma, { raisonSociale: "Boulangerie du Marais SAS" });
  await prisma.$executeRaw`
    UPDATE "public"."companies"
    SET "activated_at" = ${new Date(daysAgo(3))}, "activated_by_sub" = ${E2E_STAFF_ID},
        "activated_by_staff_id" = ${ALREADY_THERE}
    WHERE "id" = ${company.id}`;
  await prisma.$executeRaw`
    INSERT INTO "public"."client_notebooks" ("id", "company_id", "updated_at")
    VALUES (${NOTEBOOK_ID}, ${company.id}, ${at})`;
  await prisma.$executeRaw`
    INSERT INTO "public"."client_notes"
      ("id", "notebook_id", "position", "title", "created_by_sub", "created_by_name", "updated_at")
    VALUES (${NOTE_ID}, ${NOTEBOOK_ID}, 0, 'Livrer par la cour', ${E2E_STAFF_ID}, 'Opérateur E2E', ${at})`;
  return { companyId: company.id };
}

/** Les sept paires, ancienne puis nouvelle, dans un ordre fixe. */
export interface AuthorPair {
  readonly pair: string;
  readonly old: string | null;
  readonly new: string | null;
}

/** Relit les sept paires en SQL : Prisma ne voit plus que la moitié de chacune. */
export async function snapshot(prisma: Prisma, rows: SeededRows): Promise<readonly AuthorPair[]> {
  return prisma.$queryRaw<AuthorPair[]>`
    SELECT 'overrides' AS pair, "updated_by_sub" AS old, "updated_by_staff_id" AS new
      FROM "public"."feature_access_overrides" WHERE "key" = 'shop'
    UNION ALL
    SELECT 'exemptions', "created_by_sub", "created_by_staff_id"
      FROM "public"."feature_access_exemptions" WHERE "id" = ${EXEMPTION_ID}
    UNION ALL
    SELECT 'delivery', "updated_by_sub", "updated_by_staff_id"
      FROM "public"."delivery_settings" WHERE "key" = 'delivery'
    UNION ALL
    SELECT 'notes', "created_by_sub", "created_by_staff_id"
      FROM "public"."client_notes" WHERE "id" = ${NOTE_ID}
    UNION ALL
    SELECT 'push', "staff_sub", "staff_user_id"
      FROM "public"."staff_push_subscriptions" WHERE "id" = ${SUBSCRIPTION_ID}
    UNION ALL
    SELECT 'activation', "activated_by_sub", "activated_by_staff_id"
      FROM "public"."companies" WHERE "id" = ${rows.companyId}
    UNION ALL
    SELECT 'kbis', "kbis_certified_by_sub", "kbis_certified_by_staff_id"
      FROM "public"."companies" WHERE "id" = ${rows.companyId}`;
}

/** Ce que doit donner une recopie sur la scène : tout recopié, sauf ce qui était là. */
export const COPIED: readonly AuthorPair[] = [
  { pair: "overrides", old: E2E_STAFF_ID, new: E2E_STAFF_ID },
  { pair: "exemptions", old: E2E_STAFF_ID, new: E2E_STAFF_ID },
  { pair: "delivery", old: E2E_STAFF_ID, new: E2E_STAFF_ID },
  { pair: "notes", old: E2E_STAFF_ID, new: E2E_STAFF_ID },
  { pair: "push", old: E2E_STAFF_ID, new: E2E_STAFF_ID },
  { pair: "activation", old: E2E_STAFF_ID, new: ALREADY_THERE },
  { pair: "kbis", old: null, new: null },
];

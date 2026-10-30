/**
 * Refuser de tester sur une base dont une migration APPLIQUÉE a changé depuis.
 *
 * `prisma migrate deploy` ne rejoue jamais une migration déjà appliquée, et ne
 * dit rien quand son fichier a été modifié après coup. Une base de worker
 * migrée sur un brouillon garde donc les fonctions, CHECK et semis du
 * brouillon, pendant que le dépôt en porte une autre version.
 *
 * Le 2026-10-30, `promotions-equality` échouait sur deux des quatre bases
 * locales (refus de `promotions_archive_whole` dans
 * `reprise_des_promotions()`) : elles portaient la version de la fonction
 * d'AVANT le commit de L4, qui recopiait un motif d'archivage nul. Les deux
 * autres passaient — `promotions-reprise-migration` y avait redéfini la
 * fonction depuis le fichier, et la redéfinition survit à la suite. Le
 * résultat dépendait donc de l'ordre des suites, et accusait le code.
 *
 * Prisma range dans `_prisma_migrations.checksum` le SHA-256 hexadécimal du
 * `migration.sql` (vérifié le 2026-10-30 sur la base de dev, égal à
 * `shasum -a 256` du fichier commité).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "migrations");

/** Une migration telle que la base dit l'avoir appliquée. */
export interface AppliedMigration {
  readonly name: string;
  readonly checksum: string;
}

/** Le SHA-256 hexadécimal d'un contenu, comme Prisma le calcule. */
export function migrationChecksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Les migrations appliquées dont le fichier du dépôt ne donne plus le même
 * condensé. Un fichier ABSENT n'est pas une dérive : une branche voisine peut
 * avoir migré la base plus loin, et ce n'est pas ce qui fausse un test.
 */
export function driftedMigrations(
  applied: readonly AppliedMigration[],
  contentOf: (name: string) => string | null,
): readonly string[] {
  return applied
    .filter((migration) => {
      const content = contentOf(migration.name);
      return content !== null && migrationChecksum(content) !== migration.checksum;
    })
    .map((migration) => migration.name);
}

function repositoryContentOf(name: string): string | null {
  const file = join(MIGRATIONS_DIR, name, "migration.sql");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** Lève en nommant les migrations modifiées et le geste qui rend la base juste. */
export async function assertMigrationsUnchanged(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<AppliedMigration>(
      `SELECT migration_name AS name, checksum FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const drifted = driftedMigrations(result.rows, repositoryContentOf);
    if (drifted.length > 0) {
      throw new Error(
        `La base de test ${new URL(url).pathname.slice(1)} porte une version périmée de ` +
          `${String(drifted.length)} migration(s), modifiée(s) après application : ` +
          `${drifted.join(", ")}.\n` +
          `  Supprimez les bases lfc_b2b_test_w* (jetables), puis : ` +
          `pnpm --filter lfd-api db:test:setup`,
      );
    }
  } finally {
    await client.end();
  }
}

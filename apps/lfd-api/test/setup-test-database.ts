/**
 * Provisionne les bases **jetables** des tests e2e — `pnpm db:test:setup`.
 *
 * **Deux** bases depuis que le référentiel produit vit dans ce processus : la
 * plateforme marchande et le PIM gardent chacun la leur, exactement comme en
 * développement et en production. Une seule base pour les deux ferait passer
 * les tests là où la vraie application a deux connexions.
 *
 * Deux étapes par base, idempotentes :
 *  1. créer la db sur le serveur de dev si elle n'existe pas (`CREATE DATABASE`
 *     ne se met pas dans une migration : on ne peut pas créer une base depuis
 *     une connexion à cette base) ;
 *  2. y appliquer le schéma avec `prisma migrate deploy` — les **vraies**
 *     migrations, pas un `db push`, pour que les tests exercent exactement le
 *     schéma que la prod recevra.
 *
 * Prérequis : le conteneur Postgres tourne (`pnpm dev:infra` à la racine).
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

import { E2E_WORKERS, testChildEnv, testDatabaseUrlForSlot } from "./setup-env.js";

/** Une base de test : son URL, et la config Prisma qui porte ses migrations. */
interface TestDatabase {
  readonly label: string;
  readonly url: string;
  /** `null` = la config par défaut (`prisma.config.ts`). */
  readonly prismaConfig: string | null;
}

// UNE base depuis B4 : le référentiel avait la sienne, il est maintenant le
// schéma `pim` de celle-ci. La liste reste une LISTE — c'est elle qui rendait
// l'ajout de la seconde mécanique, et qui rendra le retrait de la troisième
// aussi simple si l'occasion se présente.
// UNE base PAR WORKER e2e, depuis que les suites tournent en parallèle. Elles
// tronquent la base entre chaque cas : partagée, deux workers s'effaceraient
// leurs fixtures. Le nombre vient de `E2E_WORKERS`, la même constante que
// `jest.e2e.cjs` lit pour `maxWorkers` — deux réglages séparés finiraient par
// se désaccorder, et ce jour-là deux workers partageraient une base.
const DATABASES: readonly TestDatabase[] = Array.from(
  { length: E2E_WORKERS },
  (_unused, index) => ({
    label: `plateforme · worker ${String(index + 1)}`,
    url: testDatabaseUrlForSlot(index + 1),
    prismaConfig: null,
  }),
);

/** URL d'administration : même serveur, mais la db `postgres` toujours présente. */
function adminUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/postgres";
  parsed.search = "";
  return parsed.toString();
}

/** Le nom de la db, extrait de son URL — pas d'entrée externe ici. */
function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

async function createDatabaseIfMissing(database: TestDatabase): Promise<void> {
  const admin = adminUrl(database.url);
  const name = databaseName(database.url);
  const client = new Client({ connectionString: admin });
  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      `Postgres injoignable sur ${admin}. Démarre l'infra de dev : pnpm dev:infra (à la racine du monorepo).`,
      { cause },
    );
  }
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (existing.rowCount === 0) {
      // Pas de paramètre lié possible sur un identifiant ; le nom vient d'une
      // URL de ce fichier, jamais d'une entrée externe.
      await client.query(`CREATE DATABASE "${name}"`);
      process.stdout.write(`✔ base de test créée : ${name}\n`);
    } else {
      process.stdout.write(`• base de test déjà présente : ${name}\n`);
    }
  } finally {
    await client.end();
  }
}

function applyMigrations(database: TestDatabase): void {
  const args = ["migrate", "deploy"];
  if (database.prismaConfig !== null) {
    args.push("--config", database.prismaConfig);
  }
  const result = spawnSync("prisma", args, {
    stdio: "inherit",
    // 🔴 L'URL DE CETTE base, pas celle du process courant. `testChildEnv()`
    // sans argument rend la base du worker COURANT (`_w1` hors de Jest) : les
    // quatre `migrate deploy` partaient alors sur la même base, les trois
    // autres restaient créées mais VIDES, et la panne n'apparaissait qu'au
    // premier test tombé sur le worker 2 — sur une erreur de table manquante
    // qui n'accuse jamais le provisionnement.
    env: testChildEnv(database.url),
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`\`prisma migrate deploy\` a échoué sur la base de test ${database.label}.`);
  }
}

/**
 * Au-delà, une base de worker est déclarée **encombrée**. Une base saine en a
 * ZÉRO après un `CHECKPOINT` (mesuré le 2026-10-19 sur les quatre) ; le
 * 2026-10-03, il y en avait ~400 000 par base, et le volume Docker a manqué
 * d'inodes en plein run.
 */
const ORPHAN_FILE_THRESHOLD = 10_000;

/**
 * Compte les fichiers de la base qui ne sont le `relfilenode` d'aucune relation.
 *
 * 🔴 **Après un `CHECKPOINT`, pas avant.** Chaque `TRUNCATE` de `ctx.reset()`
 * donne un fichier neuf à chaque table ; l'ancien reste sur disque jusqu'au
 * prochain checkpoint. Au sortir d'un run de vingt suites, `w1` en portait
 * 63 396, et zéro une fois le checkpoint passé (2026-10-19) : compter avant
 * crierait au loup après chaque run. Ce qui reste après est un vrai orphelin —
 * celui d'un serveur arrêté brutalement, que Postgres ne nettoiera jamais.
 *
 * `pg_ls_dir` et `CHECKPOINT` exigent un superutilisateur (`lfc` l'est dans le
 * conteneur de dev). Sans ce droit, on le DIT et on continue : la mesure est
 * un diagnostic, pas une condition du provisionnement.
 */
async function warnIfCluttered(database: TestDatabase): Promise<void> {
  const client = new Client({ connectionString: database.url });
  await client.connect();
  try {
    await client.query("CHECKPOINT");
    const result = await client.query<{ orphans: number }>(
      `SELECT count(*)::int AS orphans
         FROM pg_ls_dir('base/' || (SELECT oid FROM pg_database WHERE datname = current_database())) AS file
        WHERE file ~ '^[0-9]+$'
          AND file::oid NOT IN (SELECT pg_relation_filenode(oid) FROM pg_class
                                 WHERE pg_relation_filenode(oid) IS NOT NULL)`,
    );
    const orphans = result.rows[0]?.orphans ?? 0;
    if (orphans > ORPHAN_FILE_THRESHOLD) {
      process.stdout.write(clutterWarning(database, orphans));
    }
  } catch (cause) {
    process.stdout.write(
      `⚠ encombrement de ${databaseName(database.url)} non mesuré : ${String(cause)}\n`,
    );
  } finally {
    await client.end();
  }
}

function clutterWarning(database: TestDatabase, orphans: number): string {
  const name = databaseName(database.url);
  return (
    `⚠ ${name} porte ${String(orphans)} fichiers orphelins (seuil ${String(ORPHAN_FILE_THRESHOLD)}).\n` +
    `  Un run risque de tomber en « No space left on device » (inodes). Bases jetables, à recréer :\n` +
    `  docker exec lfd-dev-postgres sh -c "psql -U \\"\\$POSTGRES_USER\\" -d postgres -c 'DROP DATABASE IF EXISTS \\"${name}\\" WITH (FORCE)'"\n` +
    `  pnpm --filter lfd-api db:test:setup\n`
  );
}

for (const database of DATABASES) {
  await createDatabaseIfMissing(database);
  await warnIfCluttered(database);
  applyMigrations(database);
  process.stdout.write(`✔ base de test prête (${database.label}) : ${database.url}\n`);
}

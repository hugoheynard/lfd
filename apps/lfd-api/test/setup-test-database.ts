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

import { testChildEnv, testDatabaseUrl, testPimDatabaseUrl } from "./setup-env.js";

/** Une base de test : son URL, et la config Prisma qui porte ses migrations. */
interface TestDatabase {
  readonly label: string;
  readonly url: string;
  /** `null` = la config par défaut (`prisma.config.ts`). */
  readonly prismaConfig: string | null;
}

const DATABASES: readonly TestDatabase[] = [
  { label: "plateforme", url: testDatabaseUrl(), prismaConfig: null },
  { label: "référentiel", url: testPimDatabaseUrl(), prismaConfig: "prisma.pim.config.ts" },
];

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
    env: testChildEnv(),
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`\`prisma migrate deploy\` a échoué sur la base de test ${database.label}.`);
  }
}

for (const database of DATABASES) {
  await createDatabaseIfMissing(database);
  applyMigrations(database);
  process.stdout.write(`✔ base de test prête (${database.label}) : ${database.url}\n`);
}

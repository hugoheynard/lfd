/**
 * Provisionne la base de **développement** locale — `pnpm db:dev:setup`.
 *
 * Miroir de `test/setup-test-database.ts`, mais pour `lfc_b2b_dev` (l'app en
 * dev), non `lfc_b2b_test` (les tests). Deux étapes idempotentes :
 *  1. créer la db si elle manque (`CREATE DATABASE` ne peut pas vivre dans une
 *     migration : on ne crée pas une base depuis une connexion à cette base) ;
 *  2. y appliquer les VRAIES migrations (`prisma migrate deploy`), pour que le
 *     dev exerce exactement le schéma que la prod recevra.
 *
 * Prérequis : le conteneur Postgres tourne (`pnpm dev:infra` à la racine).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

import { DEV_DATABASE_URL } from "./dev-db-url.js";

const DEV_DB_NAME = new URL(DEV_DATABASE_URL).pathname.replace(/^\//, "");

/** URL d'administration : même serveur, mais la db `postgres` toujours présente. */
function adminUrl(): string {
  const url = new URL(DEV_DATABASE_URL);
  url.pathname = "/postgres";
  url.search = "";
  return url.toString();
}

async function createDatabaseIfMissing(): Promise<void> {
  const client = new Client({ connectionString: adminUrl() });
  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      `Postgres injoignable sur ${adminUrl()}. Démarre l'infra de dev : pnpm dev:infra (racine du monorepo).`,
      { cause },
    );
  }
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      DEV_DB_NAME,
    ]);
    if (existing.rowCount === 0) {
      // Nom = constante de ce fichier, jamais une entrée externe (pas de bind possible sur un identifiant).
      await client.query(`CREATE DATABASE "${DEV_DB_NAME}"`);
      process.stdout.write(`✔ base de dev créée : ${DEV_DB_NAME}\n`);
    } else {
      process.stdout.write(`• base de dev déjà présente : ${DEV_DB_NAME}\n`);
    }
  } finally {
    await client.end();
  }
}

function applyMigrations(): void {
  const result = spawnSync("prisma", ["migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_B2B_URL: DEV_DATABASE_URL },
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error("`prisma migrate deploy` a échoué sur la base de dev.");
  }
}

async function main(): Promise<void> {
  await createDatabaseIfMissing();
  applyMigrations();
  process.stdout.write(`✔ base de dev prête : ${DEV_DATABASE_URL}\n`);
}

main().catch((error: unknown) => {
  console.error("✗ setup base de dev échoué :", error);
  process.exitCode = 1;
});

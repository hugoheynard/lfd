/**
 * Provisionne la base **jetable** des tests e2e — `pnpm db:test:setup`.
 *
 * Deux étapes, idempotentes :
 *  1. créer la db `lfc_b2b_test` sur le serveur de dev si elle n'existe pas
 *     (`CREATE DATABASE` ne se met pas dans une migration : on ne peut pas créer
 *     une base depuis une connexion à cette base) ;
 *  2. y appliquer le schéma avec `prisma migrate deploy` — les **vraies**
 *     migrations, pas un `db push`, pour que les tests exercent exactement le
 *     schéma que la prod recevra.
 *
 * Prérequis : le conteneur Postgres tourne (`pnpm dev:infra` à la racine).
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

import { testChildEnv, testDatabaseUrl } from "./setup-env.js";

const TEST_DATABASE_NAME = "lfc_b2b_test";

/** URL d'administration : même serveur, mais la db `postgres` toujours présente. */
function adminUrl(): string {
  const url = new URL(testDatabaseUrl());
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
      `Postgres injoignable sur ${adminUrl()}. Démarre l'infra de dev : pnpm dev:infra (à la racine du monorepo).`,
      { cause },
    );
  }
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      TEST_DATABASE_NAME,
    ]);
    if (existing.rowCount === 0) {
      // Pas de paramètre lié possible sur un identifiant ; le nom est une
      // constante de ce fichier, jamais une entrée externe.
      await client.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
      process.stdout.write(`✔ base de test créée : ${TEST_DATABASE_NAME}\n`);
    } else {
      process.stdout.write(`• base de test déjà présente : ${TEST_DATABASE_NAME}\n`);
    }
  } finally {
    await client.end();
  }
}

function applyMigrations(): void {
  const result = spawnSync("prisma", ["migrate", "deploy"], {
    stdio: "inherit",
    env: testChildEnv(),
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error("`prisma migrate deploy` a échoué sur la base de test.");
  }
}

await createDatabaseIfMissing();
applyMigrations();
process.stdout.write(`✔ base de test prête : ${testDatabaseUrl()}\n`);

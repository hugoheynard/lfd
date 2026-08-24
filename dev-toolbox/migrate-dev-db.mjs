#!/usr/bin/env node
/**
 * Applique les migrations Prisma en attente sur la base de DEV, juste après
 * `dev:infra` et **avant** que turbo démarre l'API.
 *
 * Sans ça, tirer une branche qui porte une migration se paie deux fois : l'API
 * refuse de démarrer (`assertSchemaIsFresh`, et c'est bien qu'elle refuse), puis
 * il faut lire la trace, retrouver la commande, la lancer, relancer la stack.
 * Le schéma de dev doit suivre le dépôt sans qu'on y pense.
 *
 * Deux précautions :
 *
 *   1. Postgres n'accepte pas forcément les connexions quand `docker compose
 *      up -d` rend la main — le conteneur est *démarré*, pas encore *prêt*. On
 *      sonde `pg_isready` avant de lancer Prisma, sinon le premier démarrage à
 *      froid échouerait sur un refus de connexion qui n'a rien d'une erreur de
 *      migration.
 *   2. On ne rattrape PAS l'échec de `migrate deploy` : une migration qui casse
 *      doit arrêter la chaîne ici, pendant qu'on la lit, plutôt que de laisser
 *      quatre serveurs démarrer par-dessus.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const run = promisify(execFile);

const READY_TIMEOUT_MS = 60_000;
const POLL_MS = 1_000;

/** Postgres accepte-t-il les connexions ? On ne juge que le code de sortie. */
async function postgresReady() {
  try {
    await run(
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.dev.yml",
        "exec",
        "-T",
        "postgres",
        "pg_isready",
        "-U",
        "lfc",
      ],
      { timeout: 8_000 },
    );
    return true;
  } catch {
    return false;
  }
}

async function waitForPostgres() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await postgresReady()) {
      return;
    }
    await sleep(POLL_MS);
    process.stdout.write(".");
  }
  console.error(
    `\n✖ Postgres n'accepte pas les connexions après ${READY_TIMEOUT_MS / 1000}s. Vérifie \`pnpm dev:infra\`.`,
  );
  process.exit(1);
}

async function main() {
  await waitForPostgres();

  const deploy = await run("pnpm", ["--filter", "lfd-api", "exec", "prisma", "migrate", "deploy"], {
    // Une migration lourde peut dépasser la minute ; on préfère attendre qu'un
    // timeout qui laisserait la base à mi-chemin.
    timeout: 300_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  // Silencieux quand il n'y a rien à faire : le cas courant ne doit pas noyer la
  // sortie de démarrage. On ne parle que si le schéma a bougé.
  if (!deploy.stdout.includes("No pending migrations")) {
    console.log(deploy.stdout.trim());
  }
}

main().catch((error) => {
  console.error("\n✖ Migrations de dev non appliquées.\n");
  console.error([error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim());
  process.exit(1);
});

#!/usr/bin/env node
/**
 * S'assure que le démon Docker tourne **avant** `docker compose up`, pour que la
 * chaîne `suite:dev:*` démarre du premier coup même quand Docker Desktop est
 * fermé — au lieu d'échouer sur « Cannot connect to the Docker daemon ».
 *
 * Chemin rapide : si le démon répond déjà, on sort immédiatement (cas courant,
 * ~coût d'un `docker info`). Sinon, sur macOS on lance Docker Desktop
 * (`open -a Docker`) et on attend qu'il soit prêt, en sondant. Ailleurs — ou si
 * le lancement échoue, ou s'il ne répond pas à temps — on sort avec un code
 * non-nul et un message actionnable, sans laisser turbo démarrer sur une infra
 * absente.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { platform } from "node:process";

const run = promisify(execFile);

/** Démarrage à froid de Docker Desktop : large, pour ne jamais abandonner trop tôt. */
const READY_TIMEOUT_MS = 180_000;
const POLL_MS = 2_000;

/** Le démon répond-il ? On ne juge que le code de sortie de `docker info`. */
async function daemonUp() {
  try {
    await run("docker", ["info"], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

/** Le binaire `docker` est-il installé du tout ? */
async function haveDocker() {
  try {
    await run("docker", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await haveDocker())) {
    console.error(
      "✖ Docker introuvable. Installe Docker Desktop : https://www.docker.com/products/docker-desktop/",
    );
    process.exit(1);
  }

  if (await daemonUp()) {
    return; // déjà prêt — rien à faire
  }

  if (platform !== "darwin") {
    console.error(
      "✖ Le démon Docker est arrêté. Démarre-le puis relance — l'auto-démarrage n'est géré que sur macOS.",
    );
    process.exit(1);
  }

  console.log("• Docker est arrêté — démarrage de Docker Desktop…");
  try {
    await run("open", ["-a", "Docker"]);
  } catch {
    console.error(
      "✖ Impossible de lancer Docker Desktop (`open -a Docker`). Ouvre-le à la main puis relance.",
    );
    process.exit(1);
  }

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    if (await daemonUp()) {
      console.log("\n• Docker est prêt.");
      return;
    }
    process.stdout.write(".");
  }

  console.error(
    `\n✖ Docker Desktop n'a pas répondu en ${READY_TIMEOUT_MS / 1000}s. Ouvre-le à la main puis relance.`,
  );
  process.exit(1);
}

main();

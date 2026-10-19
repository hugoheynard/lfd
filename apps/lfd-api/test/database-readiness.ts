/**
 * Attendre que le serveur Postgres réponde, AVANT de booter l'application.
 *
 * Le 2026-10-04, `staff-roles` est tombé en 500 `persistence.database_unavailable`
 * cinq secondes après le lancement des quatre workers, et il était vert seul
 * (`documentation/ci-cd/e2e-connexions-et-isolation.md`). Au démarrage, les
 * quatre workers bootent leur application en même temps, et le serveur peut ne
 * pas encore accepter : l'application l'apprenait par sa première requête, en
 * 500, dans un test qui n'y était pour rien.
 *
 * L'attente est **bornée et explicite** : au-delà de `READY_ATTEMPTS ×
 * RETRY_DELAY_MS`, la suite échoue en nommant la base et la commande à lancer,
 * au lieu de laisser un test accuser le code.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "pg";

/** Pause entre deux essais. */
const RETRY_DELAY_MS = 500;

/** Nombre d'essais : 60 × 500 ms = trente secondes au plus. */
const READY_ATTEMPTS = 60;

/** Délai d'UN essai de connexion — sans lui, un serveur muet pendrait. */
const CONNECT_TIMEOUT_MS = 2_000;

async function probe(url: string): Promise<unknown> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return null;
  } catch (cause) {
    return cause;
  } finally {
    // `end()` sur un client jamais connecté rend sans erreur (pg 8) ; s'il
    // levait quand même, l'erreur remonterait au lieu d'être réessayée.
    await client.end();
  }
}

/**
 * Rend la main dès que la base répond à `SELECT 1` ; lève après
 * `READY_ATTEMPTS` essais, avec la dernière cause.
 */
export async function waitForDatabase(url: string): Promise<void> {
  let lastFailure: unknown = null;
  for (let attempt = 1; attempt <= READY_ATTEMPTS; attempt++) {
    lastFailure = await probe(url);
    if (lastFailure === null) {
      return;
    }
    await sleep(RETRY_DELAY_MS);
  }
  const waitedSeconds = String((READY_ATTEMPTS * RETRY_DELAY_MS) / 1_000);
  throw new Error(
    `La base de test ne répond pas après ${waitedSeconds} s d'attente (${redact(url)}).\n` +
      `  1. pnpm dev:infra                          (à la racine — démarre Postgres)\n` +
      `  2. pnpm --filter lfd-api db:test:setup     (crée et migre les bases des workers)`,
    { cause: lastFailure },
  );
}

/** L'URL sans son mot de passe, pour un message qui finit dans un log de CI. */
function redact(url: string): string {
  const parsed = new URL(url);
  parsed.password = "";
  return parsed.toString();
}

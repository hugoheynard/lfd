/**
 * **La base de dev, vue des outils** — ce que le hook post-commit
 * (`sync-dev-db-after-git.mjs`) et le lanceur de l'API (`api-dev.mjs`) ont en
 * commun. Un seul endroit pour la garde « base locale seulement » : la recopier
 * dans deux scripts serait la façon sûre qu'un jour l'une des deux s'élargisse.
 *
 * L'URL de la base est lue dans `apps/lfd-api/.env`, jamais affichée ni passée
 * en argument.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = "apps/lfd-api/prisma/migrations";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** La commande qu'un humain relance quand l'outil n'a pas pu le faire. */
export const DEV_DB_RETRY = "pnpm --filter lfd-api db:deploy && pnpm --filter lfd-api db:generate";

/** L'URL de la base de dev vise-t-elle cette machine ? Lue, jamais affichée. */
export function databaseIsLocal() {
  let env;
  try {
    env = readFileSync(join(ROOT, "apps/lfd-api/.env"), "utf8");
  } catch {
    return false;
  }
  const line = env.split("\n").find((l) => l.startsWith("DATABASE_LFD_URL="));
  if (line === undefined) {
    return false;
  }
  const raw = line
    .slice("DATABASE_LFD_URL=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
  try {
    const url = new URL(raw);
    return (
      (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
      LOCAL_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Une seule sonde, sans attendre : Docker endormi ne doit faire patienter personne. */
export async function postgresReady() {
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
      { cwd: ROOT, timeout: 5_000 },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Les migrations que la base de dev n'a pas encore reçues, par leur nom de
 * dossier. Lu dans `prisma migrate status`, qui sort en 1 quand il en manque —
 * c'est la réponse, pas une panne.
 */
export async function pendingMigrations() {
  let said;
  try {
    const out = await run("pnpm", ["--filter", "lfd-api", "exec", "prisma", "migrate", "status"], {
      cwd: ROOT,
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    said = `${out.stdout}\n${out.stderr}`;
  } catch (error) {
    said = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`;
  }
  return [
    ...new Set(
      said
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^\d{14}_\w+$/.test(l)),
    ),
  ];
}

/** Parmi ces migrations, celles qui ne sont pas commitées telles quelles. */
export async function uncommittedMigrations(names) {
  const { stdout } = await run("git", ["status", "--porcelain", "--", MIGRATIONS], { cwd: ROOT });
  const dirty = stdout.split("\n").filter(Boolean);
  return names.filter((name) => dirty.some((line) => line.includes(`${MIGRATIONS}/${name}`)));
}

/** Applique les migrations en attente puis régénère le client — ce que fait le hook. */
export async function applyMigrations() {
  const deploy = await run("pnpm", ["--filter", "lfd-api", "exec", "prisma", "migrate", "deploy"], {
    cwd: ROOT,
    timeout: 300_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  await run("pnpm", ["--filter", "lfd-api", "exec", "prisma", "generate"], {
    cwd: ROOT,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return `${deploy.stdout}\n${deploy.stderr}`;
}

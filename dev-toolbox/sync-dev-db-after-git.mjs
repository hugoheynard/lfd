#!/usr/bin/env node
/**
 * **La base de dev suit le dépôt, sans redémarrer la stack** (Hugo,
 * 2026-10-06 : « à chaque fois qu'on ajoute une migration je suis obligé de
 * relancer le serveur de dev »).
 *
 * Appelé par les hooks `post-commit`, `post-merge` et `post-checkout`. Si le
 * geste git a fait entrer quelque chose sous `apps/lfd-api/prisma/`, il applique
 * les migrations en attente à la base de DEV puis régénère le client Prisma.
 * Le client est généré dans `apps/lfd-api/src/platform/database/client` :
 * le `tsc --watch` de `dev-toolbox/api-dev.mjs` le voit changer, réémet, et
 * l'API redémarre toute seule (avant le 2026-10-08 : `nest start --watch`).
 *
 * Pourquoi au commit, et pas en surveillant le dossier des migrations : une
 * migration en cours d'écriture (un agent la retouche avant de la commiter)
 * appliquée à moitié changerait de somme de contrôle ensuite, et Prisma
 * refuserait la version finale — la base de dev serait à refaire.
 *
 * Trois garde-fous :
 *   1. **Base locale seulement** — l'URL de `apps/lfd-api/.env` doit viser
 *      `localhost`, `127.0.0.1` ou `::1` (même liste que
 *      `apps/lfd-api/src/dev/local-development.lock.ts`). L'URL n'est jamais
 *      affichée ni passée en argument.
 *   2. **Postgres éteint = rien** — une seule sonde, sans attendre : un commit
 *      ne doit pas patienter une minute parce que Docker dort.
 *   3. **Ne bloque jamais git** — un échec s'affiche avec la commande à
 *      relancer, et le script sort toujours en 0.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);
const PRISMA_DIR = "apps/lfd-api/prisma/";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const RETRY = "pnpm --filter lfd-api db:deploy && pnpm --filter lfd-api db:generate";

/** Les fichiers que le geste git a fait changer. */
async function changedFiles(mode, args) {
  const git = (...a) => run("git", a).then((r) => r.stdout.split("\n").filter(Boolean));
  if (mode === "commit") {
    return git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD");
  }
  if (mode === "merge") {
    return git("diff", "--name-only", "ORIG_HEAD", "HEAD").catch(() => []);
  }
  // post-checkout : <ancien> <nouveau> <1 = changement de branche>
  const [from, to, branchSwitch] = args;
  if (branchSwitch !== "1" || from === to) {
    return [];
  }
  return git("diff", "--name-only", from, to).catch(() => []);
}

/** L'URL de la base de dev vise-t-elle cette machine ? Lue, jamais affichée. */
function databaseIsLocal() {
  let env;
  try {
    env = readFileSync("apps/lfd-api/.env", "utf8");
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
      { timeout: 5_000 },
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const files = await changedFiles(mode, args);
  if (!files.some((file) => file.startsWith(PRISMA_DIR))) {
    return;
  }
  if (!databaseIsLocal()) {
    console.log("ℹ︎ prisma : base de dev non locale — migrations non appliquées par le hook.");
    return;
  }
  if (!(await postgresReady())) {
    console.log(`ℹ︎ prisma : Postgres de dev éteint — à appliquer plus tard : ${RETRY}`);
    return;
  }
  try {
    const deploy = await run(
      "pnpm",
      ["--filter", "lfd-api", "exec", "prisma", "migrate", "deploy"],
      { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
    );
    await run("pnpm", ["--filter", "lfd-api", "exec", "prisma", "generate"], {
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    // Prisma 7 n'écrit plus « Applying migration » : il dit seulement qu'il
    // n'y avait rien à faire, ou liste ce qu'il a appliqué (vu le 2026-10-06).
    const said = `${deploy.stdout}\n${deploy.stderr}`;
    console.log(
      said.includes("No pending migrations")
        ? "✓ prisma : base de dev à jour, client régénéré."
        : "✓ prisma : migrations appliquées à la base de dev, client régénéré — l'API redémarre seule.",
    );
  } catch (error) {
    const said = String(error?.stderr || error?.message || error)
      .split("\n")
      .slice(-6)
      .join("\n");
    console.log(
      `✖ prisma : la mise à jour de la base de dev a échoué.\n${said}\nÀ relancer : ${RETRY}`,
    );
  }
}

main()
  .catch(() => undefined)
  .finally(() => process.exit(0));

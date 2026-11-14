#!/usr/bin/env node
/**
 * Répartit les fichiers lintés du backend entre N morceaux parallèles de la CI.
 *
 * L'ESLint du backend lit les types (`recommendedTypeChecked`) et prenait
 * ~6 min 20 d'un seul tenant (CI du 2026-11-14). Son cache ne convient pas :
 * il ne regarde que le fichier lui-même, et un fichier inchangé dont un type
 * dépendant a changé ressortirait vert. Le découpage garde la garantie entière —
 * chaque morceau charge tous les types — et ne fait que partager les fichiers.
 *
 * Le périmètre est celui de `lint:ci` (`apps/lfd-api/package.json`) :
 * `src/**`, `test/**`, `container/__tests__/**`, moins les clients Prisma
 * générés que `eslint.config.mjs` ignore. Un tour de rôle sur la liste triée
 * mélange les dossiers, donc équilibre sans mesure.
 *
 * 🔴 Chaque fichier va dans exactement un morceau : la partition porte sur le
 * DISQUE, jamais sur une liste écrite (`__tests__/lint-shard.test.mjs`).
 *
 * Usage : `node dev-toolbox/ci/lint-shard.mjs <index> <total>` (index de 1 à N),
 * depuis n'importe où ; imprime des chemins relatifs à `apps/lfd-api`.
 */
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../apps/lfd-api");

/** Les racines lintées par `lint:ci`. */
const ROOTS = ["src", "test", "container/__tests__"];

/** Ce que `eslint.config.mjs` ignore : les clients Prisma générés. */
const GENERATED = ["src/platform/database/client/", "src/pim/infra/database/client/"];

/** Tous les fichiers lintés, chemins relatifs à `apps/lfd-api`, triés. */
export function lintedFiles(apiDir = API_DIR) {
  const files = [];
  for (const root of ROOTS) {
    const absolute = join(apiDir, root);
    if (!exists(absolute)) {
      continue;
    }
    for (const entry of readdirSync(absolute, { recursive: true })) {
      const path = relative(apiDir, join(absolute, String(entry)))
        .split("\\")
        .join("/");
      if (
        path.endsWith(".ts") &&
        !path.includes("/node_modules/") &&
        !GENERATED.some((prefix) => path.startsWith(prefix))
      ) {
        files.push(path);
      }
    }
  }
  return files.sort();
}

/** Les fichiers du morceau `index` sur `total` (index de 1 à `total`). */
export function shardOf(files, index, total) {
  return files.filter((_, position) => position % total === index - 1);
}

function exists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = Number(process.argv[2]);
  const total = Number(process.argv[3]);
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total) {
    console.error("Usage : node dev-toolbox/ci/lint-shard.mjs <index> <total>");
    process.exit(2);
  }
  const shard = shardOf(lintedFiles(), index, total);
  if (shard.length === 0) {
    console.error(`Le morceau ${index}/${total} est vide : rien à linter, ce qui est suspect.`);
    process.exit(1);
  }
  process.stdout.write(shard.join("\n") + "\n");
}

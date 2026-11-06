#!/usr/bin/env node
/**
 * Gate : **aucune commande retirée du `package.json` racine n'est encore
 * citée** (2026-11-06, Hugo : le `package.json` réduit à l'essentiel).
 *
 * Les portes sont sorties du `package.json` pour `lint/lint-backend.json`
 * (`pnpm lint:x` → `pnpm gate x`), les outils occasionnels pour
 * `lint/tools.json` (`pnpm copy:digest` → `pnpm tool copy:digest`). Une
 * citation oubliée ne casse rien à la lecture — elle casse le jour où
 * quelqu'un la tape, ou pire : dans un workflow, que seul GitHub lit, et qui
 * échoue alors en zéro seconde.
 *
 * ## Ce que la porte refuse
 *
 * `pnpm <commande>` ou `pnpm run <commande>` dans un fichier suivi du dépôt,
 * quand `<commande>` n'est plus un script racine et qu'elle est une porte du
 * catalogue (préfixée `lint:`), un outil de `lint/tools.json`, ou un nom
 * retiré par renommage (RENAMED). Chaque refus dit le fichier, la ligne et
 * la commande qui la remplace.
 *
 * Hors portée : les `migration.sql` (appliqués, intouchables), le lockfile,
 * et cette porte avec son test, qui citent les anciennes formes pour les
 * refuser.
 *
 * Usage : `pnpm gate no-stale-commands`. Tests :
 * `node --test dev-toolbox/__tests__/no-stale-commands.test.mjs`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Les commandes retirées par renommage, et ce qui les remplace (relevé le 2026-11-06). */
export const RENAMED = {
  "lint:send-now-admitted": "pnpm gate mail-receipt-admitted",
};

const SKIPPED = [
  /(^|\/)migration\.sql$/u,
  /^pnpm-lock\.yaml$/u,
  /^dev-toolbox\/gates\/no-stale-commands\.mjs$/u,
  /^dev-toolbox\/__tests__\/no-stale-commands\.test\.mjs$/u,
  /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz|mp4|avif)$/iu,
];

/** Les commandes retirées et leur remplaçante, d'après les scripts restants et les catalogues. */
export function retiredCommands(scripts, gates, tools) {
  const retired = new Map(Object.entries(RENAMED));
  for (const gate of gates) retired.set(`lint:${gate.name}`, `pnpm gate ${gate.name}`);
  for (const tool of tools) retired.set(tool.name, `pnpm tool ${tool.name}`);
  for (const name of Object.keys(scripts)) retired.delete(name);
  return retired;
}

const CITATION = /pnpm\s+(?:run\s+)?([a-z0-9][a-z0-9:-]*)(?![a-z0-9:-])/gu;

/** Les citations retirées d'un texte : ligne, commande citée, remplaçante. */
export function staleCitations(text, retired) {
  const found = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(CITATION)) {
      const replacement = retired.get(match[1]);
      if (replacement !== undefined) {
        found.push({ line: index + 1, command: match[1], replacement });
      }
    }
  });
  return found;
}

function main() {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  const retired = retiredCommands(
    read("package.json").scripts,
    read("lint/lint-backend.json").gates,
    read("lint/tools.json").tools,
  );
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  })
    .split("\0")
    .filter((path) => path !== "" && !SKIPPED.some((pattern) => pattern.test(path)));
  const failures = [];
  for (const path of files) {
    let text;
    try {
      text = readFileSync(join(root, path), "utf8");
    } catch {
      continue; // supprimé dans l'arbre de travail, pas encore dans l'index
    }
    for (const { line, command, replacement } of staleCitations(text, retired)) {
      failures.push(`${path}:${line}  pnpm ${command} n'existe plus — écrire : ${replacement}`);
    }
  }
  if (failures.length > 0) {
    console.error("\n✗ no-stale-commands\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} citation(s) d'une commande retirée du package.json racine. ` +
        "Les portes se lancent par `pnpm gate <nom>`, les outils par `pnpm tool <nom>` " +
        "(`pnpm gate --list`, `pnpm tool`).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ no-stale-commands : ${files.length} fichier(s) lus, aucune des ${retired.size} commandes retirées n'est citée.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

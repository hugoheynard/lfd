#!/usr/bin/env node
/**
 * Gate : **dans le référentiel, un sous-contexte ne lit que les tables qu'il
 * écrit** (`documentation/pim/plan-referentiel-a-neuf.md`, L9).
 *
 * `lint:pim-subcontexts` lit les imports, et `lint:prisma-model-ownership`
 * traite `src/pim` comme un seul bloc : ni l'une ni l'autre ne voit un
 * adaptateur de `category` qui compte les lignes de `product`. Celle-ci lit
 * les appels Prisma (`<client>.<modèle>.<opération>(`) et range chaque modèle
 * chez le sous-contexte qui l'écrit (`create`, `update`, `upsert`, `delete`…,
 * y compris en `*Many`).
 *
 * - Un modèle a pour propriétaires les sous-contextes qui l'écrivent. Un
 *   modèle écrit seulement par imbrication (`variants: { create }`) n'a pas
 *   d'écrivain visible : `declaredOwners` de la dette le range.
 * - Une lecture (`find*`, `count`, `groupBy`, `aggregate`) par un
 *   sous-contexte qui n'est pas propriétaire viole : le propriétaire publie
 *   une lecture nommée, le lecteur la compose.
 * - Les racines (`pim.module.ts`, `appBootstrap/` hors bloc) composent et
 *   sont exemptées ; le SQL écrit à la main (`$queryRaw`) n'est pas lu ici.
 *
 * La dette (`pim-table-owners-debt.json`, `reads`) compte les lectures par
 * `fichier → modèle` et ne peut que décroître.
 *
 * Usage : `pnpm gate pim-table-owners` ; `--brouillon-dette` imprime la dette
 * mesurée.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ROOT_CONTEXT, contextOf } from "./pim-subcontexts.mjs";

const PIM = "apps/lfd-api/src/pim";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DEBT_FILE = join(HERE, "pim-table-owners-debt.json");

const WRITES = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);
const READS = new Set([
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "groupBy",
  "aggregate",
]);

const CALL = /\b(?:prisma|tx|client|db|transaction)\s*\.\s*([a-z]\w*)\s*\.\s*(\w+)\s*\(/g;

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

/** Les appels Prisma d'un source : `{ model, operation }`. */
export function callsOf(source) {
  return [...withoutComments(source).matchAll(CALL)].map((match) => ({
    model: match[1],
    operation: match[2],
  }));
}

const isTest = (path) => path.includes("__tests__/") || path.endsWith(".spec.ts");

/** Propriétaires et lectures étrangères, sur `{ path, source }` (chemins sous `pim/`). */
export function analyse(files, declaredOwners = {}) {
  const owners = new Map(
    Object.entries(declaredOwners).map(([model, contexts]) => [model, new Set(contexts)]),
  );
  const reads = [];
  for (const { path, source } of files) {
    if (isTest(path)) continue;
    const context = contextOf(path);
    if (context === null || context === ROOT_CONTEXT) continue;
    for (const { model, operation } of callsOf(source)) {
      if (WRITES.has(operation)) {
        if (!owners.has(model)) owners.set(model, new Set());
        owners.get(model).add(context);
      } else if (READS.has(operation)) {
        reads.push({ path, context, model });
      }
    }
  }
  const violations = new Map();
  for (const { path, context, model } of reads) {
    const own = owners.get(model);
    if (own === undefined || own.has(context)) continue;
    const key = `${path} → ${model}`;
    violations.set(key, (violations.get(key) ?? 0) + 1);
  }
  return { owners, violations };
}

/** Le verdict contre la dette inscrite. */
export function verdict({ owners, violations }, debt) {
  const failures = [];
  const inscribed = debt.reads ?? {};
  for (const [key, count] of violations) {
    const allowed = inscribed[key] ?? 0;
    if (count > allowed) {
      const model = key.split(" → ")[1];
      const who = [...(owners.get(model) ?? [])].join(", ");
      failures.push(
        `  ${key}  ${count} lecture(s), la dette en admet ${allowed} — table écrite par ${who} : lis la lecture nommée que le propriétaire publie`,
      );
    }
  }
  for (const [key, allowed] of Object.entries(inscribed)) {
    const count = violations.get(key) ?? 0;
    if (count < allowed) {
      failures.push(
        `  ${key}  ${count} lecture(s), la dette en compte ${allowed} — baisse le compte (ou retire la ligne)`,
      );
    }
  }
  return failures;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function main() {
  const root = join(process.cwd(), PIM);
  const files = sourceFiles(root).map((file) => ({
    path: relative(root, file).split("\\").join("/"),
    source: readFileSync(file, "utf8"),
  }));
  const debt = JSON.parse(readFileSync(DEBT_FILE, "utf8"));
  const found = analyse(files, debt.declaredOwners ?? {});
  if (process.argv.includes("--brouillon-dette")) {
    const sorted = [...found.violations].sort(([a], [b]) => a.localeCompare(b));
    console.log(JSON.stringify({ reads: Object.fromEntries(sorted) }, null, 2));
    return;
  }
  const failures = verdict(found, debt);
  if (failures.length > 0) {
    console.error(`\n✗ pim-table-owners\n\n${failures.join("\n")}\n`);
    process.exit(1);
  }
  const total = [...found.violations.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `✓ pim-table-owners : ${found.owners.size} modèle(s) rangés chez leur écrivain ; dette : ${total} lecture(s) étrangère(s), ${found.violations.size} paire(s).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

#!/usr/bin/env node
/**
 * Gate : **le référentiel se lit dans un seul sens** — des référentiels de
 * base vers ce qui les cite (`documentation/pim/plan-referentiel-a-neuf.md`,
 * L0, L1 et L1 bis).
 *
 * `lint:context-boundaries` ne raisonne qu'au premier niveau de `src/` : à
 * l'intérieur de `src/pim`, rien ne tenait le sens des dépendances, et
 * `vat-rates`, `sales-contexts`, `allergens`, `ingredients` et
 * `order-time-limitation` se lisent en cycle avec `catalogue` ou `channels`.
 *
 * ## La carte : le dossier fait foi, avant comme après le déménagement
 *
 * Le sous-contexte d'un fichier se lit sur son chemin, et la carte connaît
 * les deux arborescences : `vat-rates/…` et `reference/vat-rates/…` sont le
 * même sous-contexte. Déménager (L1 bis) ne désarme donc pas la porte. Un
 * dossier inconnu échoue : il se classe ici avant d'exister.
 *
 * ## Les arêtes admises
 *
 * - tout le monde lit le noyau : `shared/`, `journal/`, `changes/`, `infra/` ;
 *   le noyau ne lit que le noyau ;
 * - un référentiel de base (`reference/*`) lit un autre référentiel de base,
 *   jamais `catalogue` ni `channels` ;
 * - `catalogue` lit `reference/*` et `order-time-limitation` ;
 * - `order-time-limitation` ne lit que le noyau ;
 * - `channels` lit `catalogue`, `reference/*` et `order-time-limitation` ;
 * - aucun cycle entre sous-contextes sur les arêtes admises.
 *
 * Les racines du bloc (`pim.module.ts`) composent et sont exemptées.
 *
 * ## La dette, décroissante
 *
 * `pim-subcontexts-debt.json` compte les imports qui violent, par
 * `fichier → sous-contexte cible`. Un compte qui monte, une paire neuve
 * échouent ; une paire qui ne viole plus ou dont le compte a baissé échoue
 * aussi, sans quoi la ligne resterait un passe-droit.
 *
 * Usage : `pnpm gate pim-subcontexts` ; `--brouillon-dette` imprime la dette
 * mesurée (à relire : une entrée neuve est une faute, pas une ligne à coller).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PIM = "apps/lfd-api/src/pim";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DEBT_FILE = join(HERE, "pim-subcontexts-debt.json");

export const ROOT_CONTEXT = "(racine)";
const CORE = ["shared", "journal", "changes", "infra"];
const REFERENCES = ["vat-rates", "sales-contexts", "allergens", "ingredients"];
const OTL = "order-time-limitation";
const isReference = (context) => context.startsWith("reference/");

/** Le sous-contexte d'un chemin sous `pim/`, ou `null` s'il n'est pas classé. */
export function contextOf(path) {
  const parts = path.split("/");
  if (parts.length === 1) return ROOT_CONTEXT;
  const [head, second] = parts;
  if (CORE.includes(head)) return head;
  if (REFERENCES.includes(head)) return `reference/${head}`;
  if (head === "reference" && REFERENCES.includes(second)) return `reference/${second}`;
  if (head === "catalogue") return "catalogue";
  if (head === OTL) return OTL;
  if (head === "channels") return "channels";
  return null;
}

/** `a` peut-il lire `b` ? */
export function isAllowed(a, b) {
  if (a === b || a === ROOT_CONTEXT || b === ROOT_CONTEXT) return true;
  if (CORE.includes(b)) return true;
  if (CORE.includes(a)) return false;
  if (isReference(a)) return isReference(b);
  if (a === "catalogue") return isReference(b) || b === OTL;
  if (a === "channels") return isReference(b) || b === OTL || b === "catalogue";
  return false;
}

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;

/** Les imports relatifs d'un fichier qui restent sous `pim/`. */
export function importsOf(path, source) {
  const found = [];
  for (const match of withoutComments(source).matchAll(IMPORT)) {
    if (!match[1].startsWith(".")) continue;
    const target = normalize(join(dirname(path), match[1].replace(/\.js$/, ".ts")));
    if (!target.startsWith("..")) found.push(target.split("\\").join("/"));
  }
  return found;
}

/** Les cycles entre sous-contextes, sur les arêtes ADMISES (la dette est jugée à part). */
export function contextCycles(edges) {
  const graph = new Map();
  for (const [a, b] of edges) {
    if (!graph.has(a)) graph.set(a, new Set());
    graph.get(a).add(b);
  }
  const cycles = new Set();
  const visit = (node, stack) => {
    for (const next of graph.get(node) ?? []) {
      const at = stack.indexOf(next);
      if (at >= 0) {
        const loop = stack.slice(at);
        const start = loop.indexOf([...loop].sort()[0]);
        cycles.add([...loop.slice(start), ...loop.slice(0, start), loop[start]].join(" → "));
      } else visit(next, [...stack, next]);
    }
  };
  for (const node of graph.keys()) visit(node, [node]);
  return [...cycles].sort();
}

/** Ce qui viole, sur `{ path, source }` (chemins sous `pim/`). */
export function analyse(files) {
  const problems = [];
  const violations = new Map();
  const admitted = new Set();
  for (const { path, source } of files) {
    const own = contextOf(path);
    if (own === null) {
      problems.push(`  ${path}  dossier inconnu de la carte — classe-le dans pim-subcontexts.mjs`);
      continue;
    }
    for (const target of importsOf(path, source)) {
      const theirs = contextOf(target);
      if (theirs === null || theirs === own) continue;
      if (isAllowed(own, theirs)) {
        if (own !== ROOT_CONTEXT && theirs !== ROOT_CONTEXT) admitted.add(`${own}\u0000${theirs}`);
        continue;
      }
      const key = `${path} → ${theirs}`;
      violations.set(key, (violations.get(key) ?? 0) + 1);
    }
  }
  const cycles = contextCycles([...admitted].map((edge) => edge.split("\u0000")));
  return { problems, violations, cycles };
}

/** Le verdict contre la dette inscrite. */
export function verdict({ problems, violations, cycles }, debt) {
  const failures = [...problems];
  for (const cycle of cycles)
    failures.push(`  ${cycle}  cycle entre sous-contextes — coupe-le par un port`);
  const inscribed = debt.imports ?? {};
  for (const [key, count] of violations) {
    const allowed = inscribed[key] ?? 0;
    if (count > allowed) {
      failures.push(
        `  ${key}  ${count} import(s), la dette en admet ${allowed} — arête hors du sens admis : passe par un port que le sous-contexte lu déclare, ou range le fichier là où vivent ses dépendances`,
      );
    }
  }
  for (const [key, allowed] of Object.entries(inscribed)) {
    const count = violations.get(key) ?? 0;
    if (count < allowed) {
      failures.push(
        `  ${key}  ${count} import(s), la dette en compte ${allowed} — baisse le compte (ou retire la ligne)`,
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
  const found = analyse(files);
  if (process.argv.includes("--brouillon-dette")) {
    const sorted = [...found.violations].sort(([a], [b]) => a.localeCompare(b));
    console.log(JSON.stringify({ imports: Object.fromEntries(sorted) }, null, 2));
    return;
  }
  const debt = JSON.parse(readFileSync(DEBT_FILE, "utf8"));
  const failures = verdict(found, debt);
  if (failures.length > 0) {
    console.error(`\n✗ pim-subcontexts\n\n${failures.join("\n")}\n`);
    process.exit(1);
  }
  const total = [...found.violations.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `✓ pim-subcontexts : aucune arête neuve dans le référentiel — dette : ${total} imports, ${found.violations.size} paires fichier → sous-contexte.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

/**
 * Refuse les **cycles d'import** entre modules d'une même app ou d'un même
 * paquet.
 *
 * ## Pourquoi une porte, et pas la revue
 *
 * Un cycle ne se voit nulle part dans la chaîne : `tsc` ne s'en plaint pas, les
 * tests passent, la compilation de production réussit. Seul le NAVIGATEUR tombe
 * — à l'exécution, sur la page concernée, avec un « Failed to fetch dynamically
 * imported module » qui ne nomme ni le cycle ni les fichiers.
 *
 * C'est arrivé le 2026-08-22 : brancher les canaux du catalogue sur les
 * emplacements a ajouté cinq arêtes `catalogue → emplacements`, alors que
 * `emplacements` importait déjà son propre type `Emplacement` par le baril du
 * catalogue. L'écran Emplacements a cessé de se charger.
 *
 * ## La nuance qui décide de tout
 *
 * `verbatimModuleSyntax` est actif dans ce dépôt : les imports sont émis **tels
 * quels**.
 *
 *   import type { X } from "./m.js";    → rien n'est émis, AUCUNE arête
 *   import { type X } from "./m.js";    → `import {} from "./m.js"` : une ARÊTE
 *
 * La seconde forme n'existe que pour un type et laisse pourtant un lien à
 * l'exécution. C'est elle qui a bouclé le cycle, et c'est pour ça que cette
 * porte les distingue au lieu de traiter « ça ne parle que de types » comme
 * inoffensif.
 *
 * ## Ce qui n'est PAS une arête
 *
 * Les `import()` **dynamiques** sont ignorés : ce sont les points de coupe
 * voulus (les routes paresseuses d'Angular), et les compter ferait de chaque
 * route un cycle vers son routeur.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Les racines analysées : une app ou un paquet est un graphe à lui seul. */
const ROOTS = [
  ...listDirs(join(ROOT, "apps")).map((dir) => join(dir, "src")),
  ...listDirs(join(ROOT, "packages")).map((dir) => join(dir, "src")),
];

/** Généré, ou hors du graphe d'exécution de l'app. */
const SKIP = [/\/database\/client\//, /\.spec\.ts$/, /\/node_modules\//, /\/dist\//];

function listDirs(parent) {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parent, entry.name));
  } catch {
    return [];
  }
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (SKIP.some((re) => re.test(full))) {
      continue;
    }
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Les spécificateurs RELATIFS d'un fichier qui laissent une arête à l'exécution.
 *
 * On retire d'abord les `import type …` et les `export type …` (élidés), puis on
 * lit ce qui reste — y compris `import { type X }`, qui en laisse une.
 */
function edgesOf(source) {
  const withoutTypeOnly = source
    .replace(/^\s*import\s+type\s[\s\S]*?from\s*["'][^"']+["'];?/gm, "")
    .replace(/^\s*export\s+type\s[\s\S]*?from\s*["'][^"']+["'];?/gm, "");
  const specifiers = [];
  const statement = /^\s*(?:import|export)\b[\s\S]*?from\s*["'](\.[^"']+)["']/gm;
  for (const match of withoutTypeOnly.matchAll(statement)) {
    specifiers.push(match[1]);
  }
  // `import "./effet.js";` — un import de seul effet de bord est une arête.
  for (const match of withoutTypeOnly.matchAll(/^\s*import\s*["'](\.[^"']+)["']/gm)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

/** Résout un spécificateur relatif en fichier réel (NodeNext : `.js` → `.ts`). */
function resolveSpecifier(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ""));
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      /* candidat suivant */
    }
  }
  return null;
}

/** Tous les cycles atteints par un parcours en profondeur, sans doublon. */
function findCycles(graph) {
  const state = new Map();
  const stack = [];
  const cycles = [];
  const seen = new Set();

  function visit(node) {
    state.set(node, "open");
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === "open") {
        const cycle = stack.slice(stack.indexOf(next));
        const key = [...cycle].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (state.get(next) === undefined) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, "done");
  }

  for (const node of graph.keys()) {
    if (state.get(node) === undefined) {
      visit(node);
    }
  }
  return cycles;
}

const cycles = [];
for (const root of ROOTS) {
  const files = walk(root);
  if (files.length === 0) {
    continue;
  }
  const graph = new Map();
  for (const file of files) {
    const targets = [];
    for (const specifier of edgesOf(readFileSync(file, "utf8"))) {
      const target = resolveSpecifier(file, specifier);
      if (target !== null && !SKIP.some((re) => re.test(target))) {
        targets.push(target);
      }
    }
    graph.set(file, targets);
  }
  cycles.push(...findCycles(graph));
}

if (cycles.length > 0) {
  console.error("\n✖ Cycles d'import détectés :\n");
  for (const cycle of cycles) {
    const path = [...cycle, cycle[0]].map((file) => relative(ROOT, file));
    console.error(`  ${path.join("\n    → ")}\n`);
  }
  console.error(
    "Un cycle casse le chargement paresseux à l'EXÉCUTION, sans que tsc, les\n" +
      "tests ni la compilation ne s'en plaignent.\n\n" +
      "Souvent, la coupure est un `import { type X }` qui devrait être un\n" +
      "`import type { X }` — ou un baril qui ré-exporte le type d'un autre\n" +
      "contexte, et qu'il faut court-circuiter vers sa définition.\n",
  );
  process.exit(1);
}

console.log("✓ import-cycles : aucun cycle d'import.");

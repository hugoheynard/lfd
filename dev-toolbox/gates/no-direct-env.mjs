#!/usr/bin/env node
/**
 * Gate : l'environnement ne se lit **que** via `AppConfig`.
 *
 * Deuxième filet, **indépendant d'ESLint** : un `// eslint-disable-next-line`
 * neutraliserait la règle lint, pas ce gate. Il détecte d'ailleurs aussi les
 * tentatives de désactivation de la règle.
 *
 * Usage : `pnpm lint:no-direct-env` (branché en CI et dans le `pre-push`).
 *
 * ⚠️ Cette porte a existé PENDANT DES MOIS sans tourner nulle part. Sa liste de
 * dérogations n'avait pas suivi la croissance du dépôt — treize fichiers
 * légitimes la faisaient rougir —, donc la brancher l'aurait rendue rouge en
 * permanence, donc personne ne l'a branchée. Une porte qu'on n'ouvre jamais ne
 * garde rien, et coûte pourtant le prix de sa maintenance.
 *
 * La leçon vaut pour les quinze autres : une porte se branche le jour où elle
 * est écrite, ou elle ne se branche pas.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "client", // client Prisma généré
  "coverage",
  "out-tsc",
  ".turbo",
  ".angular",
]);

/**
 * Seuls fichiers autorisés (comparaison par suffixe → vaut pour tout backend).
 * Chaque dérogation doit être justifiée ici, sinon elle devient une porte
 * ouverte silencieuse.
 */
const ALLOWED_SUFFIXES = [
  // La passerelle elle-même, son test, et le harnais qui sème l'env des tests.
  "src/platform/config/app-config.ts",
  "src/platform/config/__tests__/app-config.spec.ts",
  "test/setup-env.ts",
  // CLI Prisma : tourne hors du runtime Nest, AppConfig n'y est pas disponible.
  // Deux configs depuis que le référentiel a rejoint le processus : une par
  // base (`prisma.config.ts`).
  "prisma.config.ts",
  // Serveur SSR Angular : le front n'a pas encore de passerelle de config.
  // À retirer d'ici le jour où il en aura une (cf. todo.md).
  "src/server.ts",
  // Les LECTEURS d'environnement, extraits d'`AppConfig` pour que la passerelle
  // reste lisible. Ils SONT la porte — la liste ci-dessus nommait `app-config.ts`
  // sans nommer la moitié qu'on lui avait retirée, ce qui rendait la porte
  // impossible à passer au vert, donc impossible à brancher.
  "src/platform/config/env-readers.ts",
  "src/platform/config/__tests__/env-readers-media-url.spec.ts",
  "src/platform/config/__tests__/env-readers-r2.spec.ts",
  // Les scripts `prisma/` : des CLI qui tournent HORS du runtime Nest — seeds,
  // provisionnement, clonage. `AppConfig` n'y existe pas, et lui en fabriquer
  // une pour un script jetable serait un coût sans contrepartie. Le suffixe est
  // volontairement large : c'est le RÉPERTOIRE qui porte la dérogation, parce
  // que c'est lui qui dit « je suis hors application ».
  "prisma/clone-dev.ts",
  "prisma/dev-db-url.ts",
  // La seed du référentiel : `prisma/pim-seed.ts` jusqu'au 2026-09-02, éclatée
  // depuis en un point d'entrée et ses modules. La dérogation avait survécu au
  // fichier qu'elle couvrait — exactement la dérive que ce commentaire est
  // censé empêcher, et qui a rendu cette porte rouge sans que rien de neuf ne
  // lise l'environnement.
  "prisma/seed-pim.ts",
  "prisma/seed-pim/declarations.ts",
  "prisma/seed-pim/replay.ts",
  "prisma/reset-growth.ts",
  "prisma/seed-fiche.ts",
  "prisma/seed-growth.ts",
  "prisma/seed-temoin-orders.ts",
  "prisma/seed.ts",
  "prisma/setup-dev-database.ts",
  // Configuration d'un lanceur de tests, pas de l'application.
  "playwright.config.ts",
];

/** Contournements cherchés dans le code (commentaires retirés au préalable). */
const CODE_PATTERNS = [
  [/\bprocess\s*\.\s*env\b/, "process.env"],
  [/\bprocess\s*\[\s*['"]env['"]\s*\]/, "process['env']"],
  [/\}\s*=\s*process\b/, "déstructuration de `process`"],
  [/=\s*process\s*;/, "liaison de `process` à une variable"],
  [/from\s+['"](?:node:)?process['"]/, "import depuis 'node:process'"],
  [/\b(?:globalThis|global)\s*\.\s*process\b/, "globalThis.process"],
];

/** Cherché dans la source brute : on ne peut pas se taire pour passer. */
const DISABLE_PATTERN = /eslint-disable[^\n]*no-restricted-(?:properties|syntax|imports)/;

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (full.endsWith(".ts") && !full.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function isAllowed(relPath) {
  const posix = relPath.split(/[\\/]/).join("/");
  return ALLOWED_SUFFIXES.some((suffix) => posix.endsWith(suffix));
}

const violations = [];

for (const root of SCAN_ROOTS) {
  const base = join(ROOT, root);
  try {
    statSync(base);
  } catch {
    continue;
  }
  for (const file of walk(base)) {
    const rel = relative(ROOT, file);
    const raw = readFileSync(file, "utf8");

    if (DISABLE_PATTERN.test(raw)) {
      violations.push([rel, "désactivation de la règle anti-process.env"]);
    }
    if (isAllowed(rel)) {
      continue;
    }
    const code = stripComments(raw);
    for (const [pattern, label] of CODE_PATTERNS) {
      if (pattern.test(code)) {
        violations.push([rel, label]);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("\n✖ Accès direct à l'environnement détecté :\n");
  for (const [file, label] of violations) {
    console.error(`  ${file}\n      → ${label}`);
  }
  console.error(
    "\nL’environnement se lit uniquement via AppConfig (src/platform/config/app-config.ts).\n",
  );
  process.exit(1);
}

console.log("✓ no-direct-env : aucun accès direct à process.env hors AppConfig");

#!/usr/bin/env node
/**
 * Gate : l'environnement ne se lit **que** via `AppConfig`.
 *
 * Deuxième filet, **indépendant d'ESLint** : un `// eslint-disable-next-line`
 * neutraliserait la règle lint, pas ce gate. Il détecte d'ailleurs aussi les
 * tentatives de désactivation de la règle.
 *
 * Usage : `pnpm lint:no-direct-env` (à brancher en CI).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['apps'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'client', // client Prisma généré
  'coverage',
  'out-tsc',
  '.turbo',
  '.angular',
]);

/**
 * Seuls fichiers autorisés (comparaison par suffixe → vaut pour tout backend).
 * Chaque dérogation doit être justifiée ici, sinon elle devient une porte
 * ouverte silencieuse.
 */
const ALLOWED_SUFFIXES = [
  // La passerelle elle-même, son test, et le harnais qui sème l'env des tests.
  'src/infra/config/app-config.ts',
  'src/infra/config/__tests__/app-config.spec.ts',
  'test/setup-env.ts',
  // CLI Prisma : tourne hors du runtime Nest, AppConfig n'y est pas disponible.
  // Deux configs depuis que le référentiel a rejoint le processus : une par
  // base (`prisma.config.ts`, `prisma.pim.config.ts`).
  'prisma.config.ts',
  'prisma.pim.config.ts',
  // Serveur SSR Angular : le front n'a pas encore de passerelle de config.
  // À retirer d'ici le jour où il en aura une (cf. todo.md).
  'src/server.ts',
];

/** Contournements cherchés dans le code (commentaires retirés au préalable). */
const CODE_PATTERNS = [
  [/\bprocess\s*\.\s*env\b/, 'process.env'],
  [/\bprocess\s*\[\s*['"]env['"]\s*\]/, "process['env']"],
  [/\}\s*=\s*process\b/, 'déstructuration de `process`'],
  [/=\s*process\s*;/, 'liaison de `process` à une variable'],
  [/from\s+['"](?:node:)?process['"]/, "import depuis 'node:process'"],
  [/\b(?:globalThis|global)\s*\.\s*process\b/, 'globalThis.process'],
];

/** Cherché dans la source brute : on ne peut pas se taire pour passer. */
const DISABLE_PATTERN =
  /eslint-disable[^\n]*no-restricted-(?:properties|syntax|imports)/;

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
      yield full;
    }
  }
}

function isAllowed(relPath) {
  const posix = relPath.split(/[\\/]/).join('/');
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
    const raw = readFileSync(file, 'utf8');

    if (DISABLE_PATTERN.test(raw)) {
      violations.push([rel, 'désactivation de la règle anti-process.env']);
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
    '\nL’environnement se lit uniquement via AppConfig (src/infra/config/app-config.ts).\n',
  );
  process.exit(1);
}

console.log('✓ no-direct-env : aucun accès direct à process.env hors AppConfig');

#!/usr/bin/env node
/**
 * Gate : **le signal des rayons part APRÈS la validation, et par un seul
 * chemin** (`documentation/caching-usage/plan-materiaux-du-catalogue.md`,
 * § 12, lot M2 — décision de Hugo du 2026-11-06, option 1).
 *
 * Depuis M2, un rayon recalculé lit le catalogue dans l'instantané : un
 * signal `ShelfChanges` parti avant la validation laisserait recalculer un
 * rayon sur l'état d'AVANT, puis le garder jusqu'à sa fin de vie (5 minutes
 * au pro). Le mécanisme est unique, et c'est lui que la porte protège :
 *
 * - `DeferredShelfChanges` est la SEULE implémentation servie du port, et
 *   elle passe par `AfterCommit` (la file d'après validation de l'unité de
 *   travail, ou de la transaction directe depuis le 2026-11-06,
 *   `platform/database/transactional-prisma.ts`) ;
 * - le port n'est lié qu'à elle (`provide: ShelfChanges` → `useClass:
 *   DeferredShelfChanges`) ;
 * - la fenêtre et la purge (`ShelfChangeWindow`, `ShelfPurge`) ne
 *   s'atteignent que depuis la plomberie du signal ({@link ADMITTED}) : un
 *   écrivain qui les appellerait contournerait la file ;
 * - un émetteur n'appelle pas `changed(…)` AVANT une écriture de la même
 *   fonction : hors transaction, le signal partirait tout de suite, avant
 *   l'écriture qu'il annonce.
 *
 * Ce qu'elle ne voit pas, et c'est dit : une écriture faite par une AUTRE
 * fonction appelée après le signal, et un ordre décidé à l'exécution. Relevé
 * le 2026-11-06 : les 40 appels de `changed(…)` suivent tous leur écriture.
 *
 * Commentaires retirés : une phrase qui raconte une écriture n'en est pas une.
 * Usage : `pnpm lint:shelf-changes-after-commit` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", "__tests__", "client"]);

/** La seule implémentation servie du port. */
export const DEFERRED =
  "apps/lfd-api/src/b2b/shared/shelf-changes/application/deferred-shelf-changes.ts";

/**
 * Qui peut atteindre la fenêtre et la purge — la plomberie du signal
 * (relevé le 2026-11-06). Un préfixe finissant par `/` admet un dossier.
 */
export const ADMITTED = {
  "apps/lfd-api/src/b2b/shared/shelf-changes/":
    "le signal lui-même : port, file, fenêtre, éventail des purges",
  "apps/lfd-api/src/appBootstrap/shelf-changes.module.ts":
    "la racine de composition relie le port, la fenêtre et les purges",
  "apps/lfd-api/src/b2b/catalog/application/pro-shelf-purge.ts":
    "une purge (le magasin des rayons pro), appelée par l'éventail seulement",
  "apps/lfd-api/src/b2b/catalog/application/public-shelf-purge.ts":
    "une purge (Workers Cache, le rayon public), appelée par l'éventail seulement",
};

/** Les commentaires racontent le mécanisme pour l'expliquer : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

const isAdmitted = (path, admitted) =>
  Object.keys(admitted).some((key) => (key.endsWith("/") ? path.startsWith(key) : path === key));

/** Une écriture en base, telle qu'un émetteur la fait (client, SQL brut, unité, acte). */
const WRITE =
  /\b(?:prisma|tx)\s*\.\s*\w+\s*\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|\$transaction\s*\(|\.\s*run\s*\(\s*async|\bacts\s*\.\s*around/;

/** Les champs qui portent le port : `private readonly shelves: ShelfChanges`. */
function signalFields(code) {
  return [...code.matchAll(/(\w+)\s*:\s*ShelfChanges\b/g)].map((m) => m[1]);
}

/**
 * Le reste de la fonction qui contient `index`, jusqu'à l'accolade qui la
 * ferme (indentation de méthode, ≤ 2 — le code est passé par Prettier). Un
 * bloc qui se termine par `return` ou `throw` après l'appel arrête la
 * lecture : ce qui suit n'est pas atteint après le signal.
 */
function restOfFunction(code, index) {
  let depth = 0;
  let blockStart = index;
  for (let i = index; i < code.length; i += 1) {
    if (code[i] === "{") {
      depth += 1;
    } else if (code[i] === "}") {
      depth -= 1;
      if (depth < 0) {
        const lineStart = code.lastIndexOf("\n", i) + 1;
        const exits = /\b(?:return|throw)\b/.test(code.slice(blockStart, i));
        if (i - lineStart <= 2 || exits) {
          return code.slice(index, i);
        }
        depth = 0;
        blockStart = i + 1;
      }
    }
  }
  return code.slice(index);
}

/** Les violations d'une source servie : `[ligne, message]`. */
export function violationsIn(raw, path = "") {
  const code = withoutComments(raw);
  const found = [];
  for (const m of code.matchAll(/\bextends\s+ShelfChanges\b/g)) {
    if (path !== DEFERRED) {
      found.push([
        lineOf(code, m.index),
        "implémente `ShelfChanges` hors de `DeferredShelfChanges`",
      ]);
    }
  }
  for (const m of code.matchAll(/provide\s*:\s*ShelfChanges\b[^}]*\}/g)) {
    if (!/useClass\s*:\s*DeferredShelfChanges\b/.test(m[0])) {
      found.push([
        lineOf(code, m.index),
        "lie `ShelfChanges` à autre chose que `DeferredShelfChanges`",
      ]);
    }
  }
  if (!isAdmitted(path, ADMITTED)) {
    for (const m of code.matchAll(/import[^;]*?\b(ShelfChangeWindow|ShelfPurge)\b[^;]*?from/gs)) {
      found.push([
        lineOf(code, m.index),
        `atteint \`${m[1]}\` — le signal passe par \`ShelfChanges\``,
      ]);
    }
  }
  for (const field of signalFields(code)) {
    const call = new RegExp(`\\b${field}\\s*\\.\\s*changed\\s*\\(`, "g");
    for (const m of code.matchAll(call)) {
      if (WRITE.test(restOfFunction(code, m.index))) {
        found.push([
          lineOf(code, m.index),
          "émet `changed(…)` AVANT une écriture de la même fonction",
        ]);
      }
    }
  }
  return found;
}

/** Le verdict sur des fichiers `{ path, source }` : les échecs, lisibles. */
export function verdict(files) {
  const failures = [];
  let emitters = 0;
  let deferred = false;
  for (const { path, source } of files) {
    for (const [line, message] of violationsIn(source, path)) {
      failures.push(`${path}:${line}  ${message}`);
    }
    if (/\.\s*changed\s*\(/.test(withoutComments(source)) && /\bShelfChanges\b/.test(source)) {
      emitters += 1;
    }
    if (path === DEFERRED) {
      deferred = true;
      const code = withoutComments(source);
      if (!/\bAfterCommit\b/.test(code) || !/\.\s*defer\s*\(/.test(code)) {
        failures.push(
          `${path}  ne passe plus par \`AfterCommit.defer\` : le signal partirait avant la validation`,
        );
      }
    }
  }
  if (!deferred) {
    failures.push(`${DEFERRED}  introuvable : la porte ne sait plus quel est le chemin unique`);
  }
  return { failures, emitters };
}

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* sources(join(dir, entry.name));
      }
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")) {
      yield join(dir, entry.name);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const files = [...sources(join(root, SCAN_ROOT))].map((full) => ({
    path: relative(root, full),
    source: readFileSync(full, "utf8"),
  }));
  const { failures, emitters } = verdict(files);
  if (failures.length > 0) {
    console.error("\n✗ shelf-changes-after-commit\n");
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    console.error(
      "\n  Le signal des rayons part par `ShelfChanges`, que `DeferredShelfChanges`\n" +
        "  diffère après la validation (`AfterCommit`). L'émettre avant l'écriture,\n" +
        "  ou atteindre la fenêtre ou la purge en direct, laisse recalculer un rayon\n" +
        "  sur l'état d'avant — puis le garder.\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ shelf-changes-after-commit : ${String(emitters)} fichier(s) émetteur(s), tous après\n` +
      "  leur écriture ; un seul chemin, `DeferredShelfChanges` → `AfterCommit`.",
  );
}

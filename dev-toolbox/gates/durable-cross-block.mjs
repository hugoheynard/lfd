#!/usr/bin/env node
/**
 * Gate : **un fait qui traverse un bloc passe par la boîte d'envoi**.
 *
 * Un `@EventsHandler` vit sur le bus EN MÉMOIRE : rien n'est persisté, rien
 * n'est rejoué. Un container qui tombe entre l'écriture d'un bloc et la
 * réaction d'un autre laisse les deux en désaccord, sans qu'aucun ne le sache —
 * une commande `placed` sur une journée close, `confirmed` avec un bac fait.
 * Entre deux blocs, la réaction est un `@DurableHandler`, écrit dans la même
 * transaction que le fait (plan
 * `documentation/journalisation/plan-evenements-durables.md`, §5).
 *
 * ## Ce que le gate DÉTECTE
 *
 * Un `@EventsHandler(X)` dont la classe `X` est importée d'un autre bloc de
 * `src/` que celui de l'abonné. Le bloc est le premier dossier sous `src/`, lu
 * dans le CHEMIN d'import — c'est l'arborescence qui dessine la frontière
 * (`CLAUDE.md` §3), pas le nom de la classe. Un canal (`production/channels/
 * commerce/`) appartient au bloc qui le déclare : un fait publié pour un autre
 * bloc est exactement le cas visé.
 *
 * Ce qu'il ne voit pas : un abonné du même bloc dont la perte coûte quand même
 * (un courriel, des points). C'est la question de l'inventaire, pas d'une porte.
 *
 * ## La dette, décroissante
 *
 * Le motif de `controller-buses` à l'envers : la liste nomme ce qui RESTE à
 * basculer. Un abonné hors liste qui traverse échoue ; un abonné inscrit qui ne
 * traverse plus échoue aussi — sans quoi le nettoyage ne tiendrait qu'à la
 * mémoire de celui qui l'a fait, et la ligne resterait un passe-droit. Le
 * solde est compté et affiché à chaque passage.
 *
 * Usage : `pnpm lint:durable-cross-block`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps/lfd-api/src");

/**
 * Les abonnés en mémoire qui écoutent encore un autre bloc — relevé le
 * 2026-10-04, à la naissance de la porte (lot E1). Chacun nomme son lot de
 * bascule ; la liste ne grandit pas, elle se vide.
 */
const DEBT = new Map([
  ["apps/lfd-api/src/b2b/catalog/application/handlers/on-product-media-changed.handler.ts", "E5"],
]);

const SKIP_DIRS = new Set(["node_modules", "__tests__", "client"]);

function typescriptFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...typescriptFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Les commentaires citent le décorateur en prose — ils n'abonnent personne. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Le bloc d'un chemin absolu : le premier dossier sous `src/`. */
function blockOf(path) {
  return relative(SRC, path).split(/[\\/]/)[0];
}

/** `name → fichier importé`, pour les imports relatifs seulement. */
function importedFrom(source, file) {
  const map = new Map();
  for (const found of source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"(\.[^"]+)"/g)) {
    const target = resolve(dirname(file), found[2].replace(/\.js$/, ".ts"));
    for (const raw of found[1].split(",")) {
      const name = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop();
      if (name) {
        map.set(name, target);
      }
    }
  }
  return map;
}

/** Les événements écoutés par fichier, et ceux qui viennent d'un autre bloc. */
function crossingsIn(file) {
  const source = withoutComments(readFileSync(file, "utf8"));
  const crossings = [];
  const imports = importedFrom(source, file);
  for (const decorator of source.matchAll(/@EventsHandler\(([^)]*)\)/g)) {
    for (const name of decorator[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      const origin = imports.get(name);
      if (origin !== undefined && blockOf(origin) !== blockOf(file)) {
        crossings.push(`${name} (${blockOf(origin)})`);
      }
    }
  }
  return crossings;
}

const stale = [...DEBT.keys()].filter((path) => !existsSync(join(ROOT, path)));
const found = new Map();
for (const file of typescriptFiles(SRC)) {
  const crossings = crossingsIn(file);
  if (crossings.length > 0) {
    found.set(relative(ROOT, file), crossings);
  }
}

const failures = [];
for (const [file, crossings] of found) {
  if (!DEBT.has(file)) {
    failures.push(
      `  ${file}  écoute ${crossings.join(", ")} en mémoire — ` +
        `un fait qui traverse un bloc se livre par la boîte d'envoi (@DurableHandler)`,
    );
  }
}
for (const file of DEBT.keys()) {
  if (!found.has(file) && !stale.includes(file)) {
    failures.push(
      `  ${file}  ne traverse plus aucun bloc en mémoire — le retirer de la dette ` +
        `(une ligne qui reste devient un passe-droit)`,
    );
  }
}
for (const file of stale) {
  failures.push(`  ${file}  inscrit en dette mais introuvable — le repointer ou le retirer`);
}

if (failures.length > 0) {
  console.error(`\n✗ durable-cross-block\n\n${failures.join("\n")}\n`);
  process.exit(1);
}

console.log(
  `✓ durable-cross-block : aucun abonné neuf en mémoire entre deux blocs.\n` +
    `  Dette restante : ${DEBT.size} abonné(s) — compté, pas ignoré.`,
);
for (const [file, lot] of DEBT) {
  console.log(`    ${file}  (${found.get(file)?.join(", ")}, lot ${lot})`);
}

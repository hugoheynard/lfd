#!/usr/bin/env node
/**
 * Gate : **« commandable ? » se lit par `isOrderable`** (plan
 * `documentation/comptes-client/carte-des-sites.md`, § 3.4).
 *
 * Un article verrouillé sort du lecteur du catalogue comme un article
 * résolu, avec ses marques : `reservation` (réservé à un autre compte) et
 * `menu` (hors de la carte du site). Un lecteur qui compare
 * `reservation === "other"` à la main ignore la carte, et vendrait au site
 * ce que son principal lui a fermé — huit lecteurs le faisaient.
 *
 * ## Ce que la porte refuse
 *
 * Dans `apps/lfd-api/src`, hors tests : une comparaison d'une marque
 * `reservation` à `"other"` (`===`, `!==`, dans les deux sens) hors de
 * `catalog/domain/orderable.ts`, qui porte `isOrderable`,
 * `unorderableCause` et `isReservedElsewhere`. Les tests en sont exclus :
 * une fixture peut dire « réservé ailleurs » comme elle veut.
 *
 * Elle ne voit pas un lecteur qui oublierait de lire les marques du tout :
 * c'est le verrou des types (`menu` obligatoire sur l'article résolu).
 *
 * Usage : `pnpm gate orderable-door`. Tests :
 * `node --test dev-toolbox/__tests__/orderable-door.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = "apps/lfd-api/src";

/** Le seul fichier qui lit la marque de réservation à la main. */
export const DOOR = `${SRC}/lafoliecoffee/catalog/domain/orderable.ts`;

/** Les fichiers jamais lus : tests, et le client Prisma généré. */
const SKIPPED = [
  /\/__tests__\//,
  /\.spec\.ts$/,
  /^apps\/lfd-api\/src\/platform\/database\/client\//,
];

const COMPARISONS = [
  /reservation\??\s*[!=]==?\s*["']other["']/g,
  /["']other["']\s*[!=]==?\s*[\w?.]*reservation\b/g,
];

/** Les commentaires citent la règle pour l'expliquer : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Les lignes d'une source qui comparent la marque à `"other"`. */
export function comparisonsIn(raw) {
  const source = withoutComments(raw);
  const lines = new Set();
  for (const pattern of COMPARISONS) {
    for (const match of source.matchAll(pattern)) lines.add(lineOf(source, match.index));
  }
  return [...lines].sort((a, b) => a - b);
}

/** Le verdict, pur. */
export function verdict(files) {
  const failures = [];
  for (const { path, source } of files) {
    if (path === DOOR || SKIPPED.some((pattern) => pattern.test(path))) continue;
    for (const line of comparisonsIn(source)) {
      failures.push(
        `${path}:${line}  compare la réservation à "other" — lire \`isOrderable\` ` +
          "(ou `isReservedElsewhere` pour un écran de tarif), catalog/domain/orderable.ts",
      );
    }
  }
  return failures;
}

function typescriptFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...typescriptFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

function main() {
  const root = process.cwd();
  const files = typescriptFiles(join(root, SRC)).map((full) => ({
    path: relative(root, full).replace(/\\/g, "/"),
    source: readFileSync(full, "utf8"),
  }));
  const failures = verdict(files);
  try {
    statSync(join(root, DOOR));
  } catch {
    failures.push(`${DOOR}  introuvable — la porte a déménagé ? corriger DOOR`);
  }
  if (failures.length > 0) {
    console.error("\n✗ orderable-door\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). « Commandable ? » se lit par isOrderable ` +
        "(carte-des-sites.md, § 3.4).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ orderable-door : ${files.length} fichier(s) lus, aucune comparaison à "other" hors de isOrderable.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

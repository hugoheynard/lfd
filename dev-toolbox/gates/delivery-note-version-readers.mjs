#!/usr/bin/env node
/**
 * Gate : **seul l'historique des documents lit les versions du bon** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5 ter, B4b.1).
 *
 * `public.delivery_note_version` fige chaque contenu d'un bon de livraison à
 * sa naissance. La facture et « livré = Σ des BL » vivent dans le même bloc :
 * `lint:prisma-model-ownership` raisonne par bloc et ne les empêcherait pas de
 * lire une version au lieu du bon courant — et de facturer un papier périmé.
 *
 * ## Ce que la porte refuse
 *
 * Dans `apps/lfd-api/src`, hors tests et client Prisma généré, l'accès Prisma
 * `deliveryNoteVersion` ou le nom SQL `delivery_note_version` (hors
 * commentaires) ailleurs que dans :
 *
 * - l'écrivain des versions, appelé par le dépôt des bons sous l'écriture ;
 * - le lecteur de l'historique des documents ;
 * - l'outillage de démonstration (`src/dev/`), qui efface les commandes semées
 *   et doit donc effacer leurs versions avant leurs bons — il n'en lit aucune.
 *
 * Usage : `pnpm gate delivery-note-version-readers`. Tests :
 * `node --test dev-toolbox/__tests__/delivery-note-version-readers.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = "apps/lfd-api/src";
const INFRA = `${SRC}/lafoliecoffee/delivery-notes/infrastructure`;

/** L'écrivain des versions. */
export const WRITER = `${INFRA}/prisma-delivery-note-version.writer.ts`;
/** Le lecteur de l'historique des documents. */
export const READER = `${INFRA}/prisma-delivery-note-versions.reader.ts`;

const DEV = `${SRC}/dev`;

/** Les effaceurs du semis de démonstration : ils suppriment, ils ne lisent pas. */
export const DEV_PURGES = [
  `${DEV}/seeding/order-restricted-children.seed.ts`,
  `${DEV}/seeding/reset-coverage.ts`,
  `${DEV}/scenario/purge/commerce.purge.ts`,
  `${DEV}/scenario/purge/purge-coverage.ts`,
];

const ANCHORS = [WRITER, READER];
const ADMITTED = [...ANCHORS, ...DEV_PURGES];

const TABLE = /\bdeliveryNoteVersion\b|\bdelivery_note_version\b/g;

/** Les fichiers jamais lus : tests, et le client Prisma généré. */
const SKIPPED = [
  /\/__tests__\//,
  /\.spec\.ts$/,
  /^apps\/lfd-api\/src\/platform\/database\/client\//,
];

/** Les commentaires citent la table pour l'expliquer : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Les lignes d'une source qui touchent la table. */
export function mentionsIn(raw) {
  const source = withoutComments(raw);
  const lines = new Set();
  for (const match of source.matchAll(TABLE)) lines.add(lineOf(source, match.index));
  return [...lines].sort((a, b) => a - b);
}

/** Le verdict, pur. */
export function verdict(files) {
  const failures = [];
  for (const { path, source } of files) {
    if (ADMITTED.includes(path)) continue;
    if (SKIPPED.some((pattern) => pattern.test(path))) continue;
    for (const line of mentionsIn(source)) {
      failures.push(
        `${path}:${line}  touche delivery_note_version — seuls l'écrivain et le lecteur de l'historique des documents la lisent`,
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

/** Les deux fichiers de l'historique : un absent veut dire que la porte ne garde plus rien. */
function missingAnchors(files) {
  return ANCHORS.flatMap((path) => {
    const file = files.find((candidate) => candidate.path === path);
    if (file === undefined)
      return [`${path}  introuvable — la table a changé de lecteur ? corriger la porte`];
    return mentionsIn(file.source).length === 0
      ? [`${path}  ne touche plus delivery_note_version — retirer l'entrée de la porte`]
      : [];
  });
}

function main() {
  const root = process.cwd();
  const files = typescriptFiles(join(root, SRC)).map((full) => ({
    path: relative(root, full).replace(/\\/g, "/"),
    source: readFileSync(full, "utf8"),
  }));
  const failures = [...missingAnchors(files), ...verdict(files)];
  if (failures.length > 0) {
    console.error("\n✗ delivery-note-version-readers\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). Une version de bon ne se lit que par l'historique des documents ` +
        "(plan-reliquat-de-commande.md, § 5 ter).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ delivery-note-version-readers : ${files.length} fichier(s) lus, les versions du bon ne sont lues que par l'historique des documents.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

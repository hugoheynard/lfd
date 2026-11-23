#!/usr/bin/env node
/**
 * Gate : **la clé d'export n'ouvre que l'export des ventes** (plan
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 6.5).
 *
 * `ExportReaderKeyGuard` admet un appel sur la seule foi de l'en-tête
 * `X-Export-Key` et pose un acteur `system`. Posée sur une autre route, elle
 * ouvrirait cette route à la Direction — et à quiconque lui a volé sa clé.
 * L'e2e d'étanchéité le voit sur l'application démarrée ; la porte le refuse
 * avant, en nommant le fichier.
 *
 * ## Ce que la porte refuse
 *
 * Dans `apps/lfd-api/src`, hors tests, le nom `ExportReaderKeyGuard` (hors
 * commentaires) ailleurs que dans :
 *
 * - le fichier de la garde ;
 * - le contrôleur de l'export (`sales-export.controller.ts`) ;
 * - le module du reporting, qui la fournit — et qui ne déclare aucun
 *   `APP_GUARD` : une garde globale s'appliquerait à toutes les routes.
 *
 * Usage : `pnpm gate export-key-guard`. Tests :
 * `node --test dev-toolbox/__tests__/export-key-guard.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = "apps/lfd-api/src";
const REPORTING = `${SRC}/lafoliecoffee/reporting`;

/** La garde elle-même. */
export const GUARD = `${REPORTING}/http/export-reader-key.guard.ts`;
/** Le seul contrôleur qui la pose. */
export const CONTROLLER = `${REPORTING}/http/sales-export.controller.ts`;
/** Le module qui la fournit. */
export const MODULE = `${REPORTING}/reporting.module.ts`;

const GUARD_NAME = /\bExportReaderKeyGuard\b/g;

/** Les fichiers jamais lus : tests, et le client Prisma généré. */
const SKIPPED = [
  /\/__tests__\//,
  /\.spec\.ts$/,
  /^apps\/lfd-api\/src\/platform\/database\/client\//,
];

/** Les commentaires citent la garde pour l'expliquer : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Les lignes d'une source qui nomment la garde. */
export function mentionsIn(raw) {
  const source = withoutComments(raw);
  const lines = new Set();
  for (const match of source.matchAll(GUARD_NAME)) lines.add(lineOf(source, match.index));
  return [...lines].sort((a, b) => a - b);
}

/** Le verdict, pur. */
export function verdict(files) {
  const failures = [];
  for (const { path, source } of files) {
    if (path === GUARD || path === CONTROLLER) continue;
    if (SKIPPED.some((pattern) => pattern.test(path))) continue;
    const lines = mentionsIn(source);
    if (lines.length === 0) continue;
    if (path === MODULE) {
      if (/\bAPP_GUARD\b/.test(withoutComments(source))) {
        failures.push(
          `${path}  fournit ExportReaderKeyGuard ET déclare un APP_GUARD — une garde globale ouvrirait toutes les routes à la clé d'export`,
        );
      }
      continue;
    }
    for (const line of lines) {
      failures.push(
        `${path}:${line}  nomme ExportReaderKeyGuard — la clé d'export n'ouvre que ${CONTROLLER}`,
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

/** Les trois fichiers attendus : un absent veut dire que la porte ne garde plus rien. */
function missingAnchors(root) {
  return [GUARD, CONTROLLER, MODULE].flatMap((path) => {
    try {
      statSync(join(root, path));
      return [];
    } catch {
      return [`${path}  introuvable — la garde a déménagé ? corriger la porte`];
    }
  });
}

function main() {
  const root = process.cwd();
  const files = typescriptFiles(join(root, SRC)).map((full) => ({
    path: relative(root, full).replace(/\\/g, "/"),
    source: readFileSync(full, "utf8"),
  }));
  const failures = [...missingAnchors(root), ...verdict(files)];
  const controller = files.find((file) => file.path === CONTROLLER);
  if (controller !== undefined && mentionsIn(controller.source).length === 0) {
    failures.push(`${CONTROLLER}  ne pose plus ExportReaderKeyGuard — l'export serait ouvert`);
  }
  if (failures.length > 0) {
    console.error("\n✗ export-key-guard\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). La clé d'export n'ouvre que l'export des ventes ` +
        "(plan-export-des-ventes.md, § 6.5).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ export-key-guard : ${files.length} fichier(s) lus, la clé d'export n'est posée que sur l'export des ventes.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

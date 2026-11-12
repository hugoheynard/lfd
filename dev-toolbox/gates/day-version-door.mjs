#!/usr/bin/env node
/**
 * Gate : **une seule porte pour savoir si une journée a changé**
 * (`documentation/caching-usage/version-par-journee.md`, D8 — Hugo,
 * 2026-11-03 : « c'est important pour ne pas dériver »).
 *
 * Six routes de version, une par journal et par droit, avaient poussé en un
 * mois ; chaque écran choisissait la sienne. La porte unique
 * `GET admin/day-versions` les a remplacées, avec un registre qui tient UNE
 * déclaration par journal. Cette porte-ci empêche le retour en arrière :
 *
 * - **côté API** (`apps/lfd-api/src`) : aucune route dont un mot du chemin est
 *   `version` (`@Controller`, `@Get`, `@Post`…), sauf `admin/versions` (la
 *   porte des sujets) et `admin/day-versions` (servie un déploiement de plus). Un
 *   journal de plus est une source de plus dans
 *   `appBootstrap/day-version-sources.module.ts`, jamais une route ;
 * - **côté back-office** (`apps/lfd-backoffice-frontend/src`) : la porte
 *   n'est appelée que par `shared/day-version/day-version.service.ts`, que
 *   seul le veilleur utilise. Un écran qui l'appellerait en direct reposerait
 *   la question que le veilleur pose déjà pour tout l'onglet.
 *
 * Commentaires retirés : une phrase qui raconte l'ancienne route n'est pas
 * une route. Les tests ne sont pas lus. Usage : `pnpm gate day-version-door`
 * (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const API_ROOT = "apps/lfd-api/src";
const FRONT_ROOT = "apps/lfd-backoffice-frontend/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", "__tests__"]);

/** La porte que le front appelle encore (le veilleur bascule au lot V2). */
const DOOR = "admin/day-versions";
/**
 * Les chemins de route qui ont le droit de dire « version » : la porte des
 * sujets (`plan-veilleur-unique.md`, § 3.3) et l'ancienne, servie un
 * déploiement de plus pour les onglets restés sur l'ancien bundle.
 */
const API_DOORS = new Set([DOOR, "admin/versions"]);
/** Le seul fichier du front qui l'appelle. */
const FRONT_CALLER = `${FRONT_ROOT}/app/shared/day-version/day-version.service.ts`;

/** `version` comme mot du chemin (`version`, `day-version`, `version/x`) — pas `conversions`. */
const VERSION_SEGMENT = /(?:^|[/-])versions?(?:$|[/-])/iu;

const ROUTE_DECORATOR =
  /@(?:Controller|Get|Post|Put|Patch|Delete|Head|All)\(\s*(["'`])([^"'`]*)\1/gu;

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

/** Les chemins de route d'un source qui parlent de version, hors la porte. */
export function versionRoutesOf(source) {
  const found = [];
  for (const match of withoutComments(source).matchAll(ROUTE_DECORATOR)) {
    const path = match[2];
    if (VERSION_SEGMENT.test(path) && !API_DOORS.has(path)) {
      found.push(path);
    }
  }
  return found;
}

/** Vrai si le source appelle la porte (son chemin, avec ou sans barre initiale). */
export function callsDoor(source) {
  return withoutComments(source).includes(DOOR);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

const unix = (path) => path.split("\\").join("/");

/** Le détecteur, éprouvé à chaque exécution : un motif cassé ne refuserait plus rien. */
function selfCheck() {
  const cases = [
    ['@Get("version")', 1],
    ['@Controller("admin/production")\n@Get(\n  "day-version",\n)', 1],
    ["@Get('production-version')", 1],
    ['@Controller("admin/day-versions")', 0],
    ['@Controller("admin/versions")', 0],
    ['// @Get("version")', 0],
    ['@Get(":id/history")', 0],
    ['@Get("conversions")', 0],
  ];
  return cases
    .filter(([source, expected]) => versionRoutesOf(source).length !== expected)
    .map(([source]) => `détecteur cassé sur : ${source}`);
}

function main() {
  const failures = selfCheck();
  const doorsFound = new Set();
  for (const file of sourceFiles(join(ROOT, API_ROOT))) {
    const rel = unix(relative(ROOT, file));
    const source = readFileSync(file, "utf8");
    for (const door of API_DOORS) {
      if (source.includes(`@Controller("${door}")`)) {
        doorsFound.add(door);
      }
    }
    for (const path of versionRoutesOf(source)) {
      failures.push(
        `${rel} : la route « ${path} » rouvre une porte de version par journal. ` +
          `Ajoutez une source au registre (appBootstrap/day-version-sources.module.ts) ; ` +
          `les seules portes sont GET ${[...API_DOORS].join(" et GET ")}.`,
      );
    }
  }
  for (const door of API_DOORS) {
    if (!doorsFound.has(door)) {
      failures.push(
        `la porte @Controller("${door}") est introuvable dans ${API_ROOT} : la porte ne regarde plus rien.`,
      );
    }
  }
  let callerFound = false;
  for (const file of sourceFiles(join(ROOT, FRONT_ROOT))) {
    const rel = unix(relative(ROOT, file));
    if (!callsDoor(readFileSync(file, "utf8"))) {
      continue;
    }
    if (rel === FRONT_CALLER) {
      callerFound = true;
      continue;
    }
    failures.push(
      `${rel} appelle ${DOOR} en direct. Confiez les journaux au DayVersionWatcher : ` +
        `il pose une seule question par journée pour tout l'onglet.`,
    );
  }
  if (!callerFound) {
    failures.push(`${FRONT_CALLER} n'appelle plus ${DOOR} : la porte ne regarde plus rien.`);
  }
  if (failures.length > 0) {
    console.error("✗ lint:day-version-door — une seule porte pour les versions de journée\n");
    for (const failure of failures) {
      console.error(`  · ${failure}`);
    }
    process.exit(1);
  }
  console.log(
    `✓ lint:day-version-door — les portes (GET ${[...API_DOORS].join(", GET ")}), un seul appelant au front.`,
  );
}

main();

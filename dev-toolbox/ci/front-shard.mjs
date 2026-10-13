#!/usr/bin/env node
/**
 * Répartit les specs d'un front Angular entre N éclats, pour `ng test`.
 *
 * Le builder `@angular/build:unit-test` (22.1) n'a PAS d'option `--shard`
 * (vérifié dans son `schema.json` le 2026-10-13) ; il accepte en revanche
 * `--include`, répétable. Ce script imprime donc les `--include=<fichier>` d'un
 * éclat, et `ng test` ne compile et n'exécute que ceux-là.
 *
 * ── Le périmètre vient d'angular.json, jamais d'ici ─────────────────────────
 * 🔴 Les motifs sont relus dans l'option `include` de la cible `test` (défaut
 * du builder : `**\/*.spec.ts` et `**\/*.test.ts`), résolus depuis le
 * `sourceRoot` comme le fait le builder. Recopier les motifs ici ferait
 * diverger les deux : un dossier ajouté à `include` (la boutique y a
 * `../preview`) tournerait en local et nulle part en CI.
 *
 * ── La répartition ──────────────────────────────────────────────────────────
 * Tour à tour sur la liste triée. Pas de durées mesurées : les specs d'un front
 * sont nombreuses (des centaines) et courtes, le coût d'un éclat est dominé
 * par la compilation commune — l'écart d'un fichier à l'autre se moyenne.
 *
 * Usage : `node dev-toolbox/ci/front-shard.mjs <dossier de l'app> <index> <total>`
 * (index de 1 à N). Sort en erreur si l'éclat est vide : un `ng test` sans
 * `--include` lancerait TOUT, et l'éclat doublerait les autres en silence.
 */
import { globSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const DEFAULT_INCLUDE = ["**/*.spec.ts", "**/*.test.ts"];

function testTarget(appDir) {
  const workspace = JSON.parse(readFileSync(join(appDir, "angular.json"), "utf8"));
  const projects = Object.values(workspace.projects);
  const withTest = projects.filter((project) => project.architect?.test);
  if (withTest.length !== 1) {
    throw new Error(
      `${appDir} : ${withTest.length} projets portent une cible test, un seul attendu`,
    );
  }
  const [project] = withTest;
  return {
    sourceRoot: join(appDir, project.sourceRoot ?? "src"),
    include: project.architect.test.options?.include ?? DEFAULT_INCLUDE,
  };
}

function specs(appDir) {
  const { sourceRoot, include } = testTarget(appDir);
  const found = new Set();
  for (const pattern of include) {
    for (const file of globSync(pattern, { cwd: sourceRoot })) {
      if (!file.split(/[\\/]/).includes("node_modules")) {
        found.add(relative(sourceRoot, join(sourceRoot, file)));
      }
    }
  }
  return [...found].sort();
}

const [appDir, rawIndex, rawTotal] = process.argv.slice(2);
const index = Number(rawIndex);
const total = Number(rawTotal);
if (!appDir || !Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total) {
  console.error("Usage : front-shard.mjs <dossier de l'app> <index 1..N> <total>");
  process.exit(2);
}

const mine = specs(appDir).filter((_, position) => position % total === index - 1);
if (mine.length === 0) {
  console.error(`Éclat ${index}/${total} vide pour ${appDir} : refus, ng test lancerait tout.`);
  process.exit(1);
}
console.log(mine.map((file) => `--include=${file}`).join("\n"));

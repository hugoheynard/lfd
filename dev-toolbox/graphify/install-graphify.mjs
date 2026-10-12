#!/usr/bin/env node
/**
 * **Installe graphify sur le poste**, appelé par le `prepare` du `pnpm install`.
 *
 * Un dev qui clone le dépôt et lance `pnpm install` a graphify, sans autre
 * geste (Hugo, 2026-10-12). L'outil s'installe HORS du dépôt, par `uv tool`,
 * à la version épinglée de `graphify-version.mjs`.
 *
 * Ce script ne fait JAMAIS échouer `pnpm install` : il sort toujours en 0.
 * Il ne fait rien :
 *  - en CI ou dans un conteneur (`CI`), où personne ne lit le graphe ;
 *  - si `LFD_SKIP_GRAPHIFY=1` — le dev qui n'en veut pas ;
 *  - si la bonne version est déjà installée.
 * Sans `uv`, il dit la commande à lancer et s'arrête.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { GRAPHIFY_PYTHON, GRAPHIFY_SPEC, GRAPHIFY_VERSION } from "./graphify-version.mjs";

/**
 * Ce que ce poste a installé, en clair. `graphify --version` dit la version,
 * pas les extras : sans ce témoin, un poste à 0.9.86 sans `[sql]` passerait
 * pour à jour.
 */
const STAMP = join(homedir(), ".cache", "lfd", "graphify-spec");

const PREFIX = "graphify :";

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

function installedVersion() {
  const result = run("graphify", ["--version"]);
  if (result.error || result.status !== 0) {
    return null;
  }
  const match = /\d+\.\d+\.\d+/.exec(`${result.stdout} ${result.stderr}`);
  return match ? match[0] : null;
}

function main() {
  if (process.env.CI || process.env.LFD_SKIP_GRAPHIFY === "1") {
    return;
  }
  if (installedVersion() === GRAPHIFY_VERSION && installedSpec() === GRAPHIFY_SPEC) {
    // Une ligne, et pas le silence : sans elle, un dev qui lance le script à
    // la main croit qu'il n'a rien fait (constaté par Hugo le 2026-10-12).
    console.log(`${PREFIX} ${GRAPHIFY_VERSION} déjà installé.`);
    buildFirstGraph();
    return;
  }
  const spec = GRAPHIFY_SPEC;
  if (run("uv", ["--version"]).error) {
    console.log(
      `${PREFIX} uv est absent — installez-le, puis : uv tool install --python ${GRAPHIFY_PYTHON} ${spec}`,
    );
    return;
  }
  console.log(`${PREFIX} installation de ${spec} (uv tool)…`);
  const result = spawnSync(
    "uv",
    ["tool", "install", "--force", "--python", GRAPHIFY_PYTHON, spec],
    {
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    console.log(
      `${PREFIX} l'installation a échoué — relancez : uv tool install --python ${GRAPHIFY_PYTHON} ${spec}`,
    );
    return;
  }
  mkdirSync(join(homedir(), ".cache", "lfd"), { recursive: true });
  writeFileSync(STAMP, spec);
  // Le cache d'extraction a été bâti sans les extras d'aujourd'hui (un .sql lu
  // sans extracteur y est noté vide) : on le jette, le graphe se refait.
  rmSync("graphify-out/cache", { recursive: true, force: true });
  rmSync("graphify-out/graph.json", { force: true });
  buildFirstGraph();
}

function installedSpec() {
  try {
    return readFileSync(STAMP, "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * Le premier graphe d'un poste neuf, sans attendre le premier commit : le même
 * rafraîchissement que les hooks, détaché. Rien si le graphe existe déjà.
 */
function buildFirstGraph() {
  if (existsSync("graphify-out/graph.json")) {
    return;
  }
  console.log(`${PREFIX} premier graphe en cours, en arrière-plan (graphify-out/).`);
  spawnSync("node", ["dev-toolbox/graphify/refresh-graph.mjs"], { stdio: "inherit" });
}

try {
  main();
} catch (error) {
  console.log(`${PREFIX} ignoré (${String(error)})`);
}

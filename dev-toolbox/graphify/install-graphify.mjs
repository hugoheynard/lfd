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

import { GRAPHIFY_PACKAGE, GRAPHIFY_VERSION } from "./graphify-version.mjs";

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
  if (installedVersion() === GRAPHIFY_VERSION) {
    return;
  }
  const spec = `${GRAPHIFY_PACKAGE}==${GRAPHIFY_VERSION}`;
  if (run("uv", ["--version"]).error) {
    console.log(`${PREFIX} uv est absent — installez-le, puis : uv tool install ${spec}`);
    return;
  }
  console.log(`${PREFIX} installation de ${spec} (uv tool)…`);
  const result = spawnSync("uv", ["tool", "install", "--force", spec], { stdio: "inherit" });
  if (result.status !== 0) {
    console.log(`${PREFIX} l'installation a échoué — relancez : uv tool install ${spec}`);
  }
}

try {
  main();
} catch (error) {
  console.log(`${PREFIX} ignoré (${String(error)})`);
}

#!/usr/bin/env node
/**
 * **Rafraîchit le graphe après un geste git** (commit, merge, checkout).
 *
 * Appelé par les hooks de `.githooks/`. Lance `graphify update .` DÉTACHÉ et
 * rend la main tout de suite : un commit n'attend jamais le graphe. La sortie
 * va dans `graphify-out/refresh.log`, ignoré par git comme tout le dossier.
 *
 * Ne fait rien si graphify n'est pas installé, en CI, ou si
 * `LFD_SKIP_GRAPHIFY=1`. Sort toujours en 0.
 *
 * ⚠️ Le graphe sert à S'ORIENTER. Une affirmation sur le code se vérifie en
 * ouvrant le fichier : un graphe en retard d'un commit dit « absent » avec
 * aplomb, comme un grep vide.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";

function main() {
  if (process.env.CI || process.env.LFD_SKIP_GRAPHIFY === "1") {
    return;
  }
  if (spawnSync("graphify", ["--version"]).error) {
    return;
  }
  mkdirSync("graphify-out", { recursive: true });
  const log = openSync("graphify-out/refresh.log", "a");
  const child = spawn("graphify", ["update", "."], {
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
}

try {
  main();
} catch {
  // Un graphe pas rafraîchi ne doit jamais casser un geste git.
}

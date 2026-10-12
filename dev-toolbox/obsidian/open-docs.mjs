#!/usr/bin/env node
/**
 * **Ouvre la documentation dans Obsidian** — `pnpm docs`.
 *
 * L'URI `obsidian://open?path=` ouvre le dossier ET l'enregistre comme coffre
 * au premier appel : un dev n'a jamais à passer par « Open folder as vault ».
 * Les réglages partagés (`documentation/.obsidian/`) sont lus d'office.
 *
 * Obsidian n'est PAS installé par ce script : une application de bureau ne
 * s'installe pas en silence depuis un `pnpm install`. Absente, le script dit
 * la commande et s'arrête.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";

const VAULT = resolve("documentation");
const URI = `obsidian://open?path=${encodeURIComponent(VAULT)}`;
const OPENERS = { darwin: "open", win32: "explorer", linux: "xdg-open" };

function installed() {
  if (platform() === "darwin") {
    return existsSync("/Applications/Obsidian.app");
  }
  // Ailleurs, on ne sait pas le vérifier sans deviner : on tente l'ouverture.
  return true;
}

if (!installed()) {
  console.log("Obsidian n'est pas installé : brew install --cask obsidian, puis pnpm docs.");
  process.exit(0);
}
const opener = OPENERS[platform()];
if (opener === undefined) {
  console.log(`Ouvrez ce lien : ${URI}`);
  process.exit(0);
}
spawnSync(opener, [URI], { stdio: "ignore" });
console.log(`Documentation ouverte dans Obsidian (${VAULT}).`);

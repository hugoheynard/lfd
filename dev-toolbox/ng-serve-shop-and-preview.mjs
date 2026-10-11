#!/usr/bin/env node
/**
 * Le `dev` de la boutique : la boutique ET son application d'aperçu des textes
 * (`lfc-ecommerce-preview`, port 7318), chacune par `ng-serve-quiet.mjs`.
 *
 * L'aperçu est encadré par l'éditeur des textes du back-office
 * (`documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §10 B3) :
 * sans lui, la colonne d'aperçu reste vide en dev. Deux processus, un seul
 * sort : si l'un tombe, l'autre est arrêté et le code de sortie est rendu —
 * la pile de dev voit la panne au lieu d'un demi-front.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const quiet = resolve(dirname(fileURLToPath(import.meta.url)), "ng-serve-quiet.mjs");
const args = process.argv.slice(2);

const children = [
  spawn(process.execPath, [quiet, ...args], { stdio: "inherit", env: process.env }),
  spawn(process.execPath, [quiet, "lfc-ecommerce-preview"], { stdio: "inherit", env: process.env }),
];

let exiting = false;
for (const child of children) {
  child.on("exit", (code, signal) => {
    if (exiting) {
      return;
    }
    exiting = true;
    for (const other of children) {
      if (other !== child) {
        other.kill("SIGTERM");
      }
    }
    process.exit(code ?? (signal === null ? 1 : 1));
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) {
      child.kill(signal);
    }
  });
}

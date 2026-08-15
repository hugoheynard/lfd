#!/usr/bin/env node
/**
 * Jette le **pré-bundle Vite** des fronts avant que la suite ne démarre.
 *
 * Le piège qu'il ferme, constaté le 2026-08-15 : les paquets de l'atelier
 * (`@lfd/contracts` et consorts) s'exposent en `dist/`, et Vite les
 * **pré-bundle** une fois pour toutes dans `.angular/cache/<v>/<app>/vite/deps`.
 * Reconstruire le paquet ne réinvalide rien — Vite ne surveille pas les
 * dépendances liées comme il surveille les sources. Le serveur continue donc de
 * servir l'ancien bundle, et l'app se casse à l'exécution sur un export qui
 * existe pourtant sur le disque :
 *
 *     SyntaxError: … does not provide an export named 'ORDER_ORIGIN_LABELS'
 *
 * Le symptôme est particulièrement traître parce que `tsc` et le build de
 * production, eux, sont verts : ils lisent le `dist`, pas le cache.
 *
 * **On ne purge QUE `vite/deps`**, jamais tout `.angular/cache` : le reste est
 * le cache de compilation d'Angular, et le jeter rallongerait chaque démarrage
 * pour rien — ce n'est pas lui qui périme.
 *
 * ## Pourquoi pas `prebundle: { exclude: [...] }`
 *
 * Angular expose l'option, et elle serait plus élégante — mais elle ne marche
 * pas ici, essayé et mesuré : sortir `@lfd/contracts` du pré-bundle oblige
 * l'app à résoudre elle-même **zod**, la dépendance du paquet. Avec la mise en
 * page stricte de pnpm, `zod` n'est pas visible depuis le `node_modules` d'une
 * app, et le serveur rend 500 sur le premier chunk qui touche aux contrats — or
 * c'était précisément le pré-bundle qui le résolvait. Le jour où les fronts
 * déclareraient zod, l'option redeviendrait la bonne réponse.
 */
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APPS = join(ROOT, "apps");

/** Les caches Vite d'une app : `.angular/cache/<version>/<projet>/vite/deps`. */
async function viteDepsDirs(appDir) {
  const cacheRoot = join(appDir, ".angular", "cache");
  const found = [];
  for (const version of await listDirs(cacheRoot)) {
    for (const project of await listDirs(join(cacheRoot, version))) {
      found.push(join(cacheRoot, version, project, "vite", "deps"));
    }
  }
  return found;
}

/** Les sous-dossiers d'un chemin, ou rien du tout s'il n'existe pas. */
async function listDirs(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Le chemin existe-t-il ? Une question, pas une exception. */
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let purged = 0;
  for (const app of await listDirs(APPS)) {
    for (const deps of await viteDepsDirs(join(APPS, app))) {
      // `force` avale l'absence : on compte donc ce qui existait VRAIMENT, sinon
      // le message annoncerait des purges qui n'ont rien purgé.
      const existed = await exists(deps);
      await rm(deps, { recursive: true, force: true });
      purged += existed ? 1 : 0;
    }
  }
  // Silencieux quand il n'y a rien à faire : ce script tourne à chaque
  // démarrage, il n'a pas à ajouter une ligne de bruit avant les vraies.
  if (purged > 0) {
    console.log(`↻ pré-bundle Vite purgé (${purged}) — les paquets de l'atelier repartent à neuf`);
  }
}

await main();

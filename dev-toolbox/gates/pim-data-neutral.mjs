#!/usr/bin/env node
/**
 * Gate : **la couche modèle du référentiel ne connaît aucun canal.**
 *
 * `src/app/pim/data/` (dans chaque app qui porte un référentiel) tient ce que
 * TOUS les écrans du référentiel lisent : le modèle, les canaux de vente d'une
 * gamme, le SKU. Elle a longtemps porté autre chose — `tvaTagFromPercent`,
 * `generateFiches`, un `collections.ts` entier. Soit `tag`, `handle`, « fiche »
 * et « collection » : quatre mots de **Shopify**, au milieu du vocabulaire du
 * catalogue.
 *
 * Ce n'est pas une question de rangement. Le référentiel fiscal a déjà rendu
 * son `tag` pour la même raison : un taux de TVA est une donnée comptable, un
 * handle de collection est du vocabulaire de canal, et faire porter le second
 * par le premier revenait à faire décrire au référentiel un de ses
 * consommateurs. Tant que la dérivation vivait dans `data/`, six écrans qui
 * n'ont rien à voir avec Shopify la traînaient dans leur bundle et pouvaient
 * l'appeler par accident.
 *
 * Ce qu'il vérifie, et rien d'autre : aucun fichier de `pim/data/` n'importe
 * de `pim/channels/` ni de `pim/integration/`. La direction est à sens unique —
 * un canal lit le catalogue, le catalogue ignore les canaux.
 *
 * Il ne dit RIEN des écrans : `products-page` affiche l'état de synchronisation
 * Shopify d'une fiche, et c'est légitime — un opérateur veut le voir à côté du
 * produit. Ce gate ne garde que la couche partagée, là où l'accident est muet.
 *
 * Usage : `pnpm lint:pim-data-neutral` (branché en CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Les dossiers qu'une couche modèle du référentiel n'a pas à connaître. */
const FORBIDDEN = ["channels", "integration"];

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else if (full.endsWith(".ts")) {
      found.push(full);
    }
  }
  return found;
}

function dataDirs() {
  const apps = join(ROOT, "apps");
  const dirs = [];
  for (const app of readdirSync(apps)) {
    const candidate = join(apps, app, "src/app/pim/data");
    try {
      if (statSync(candidate).isDirectory()) {
        dirs.push(candidate);
      }
    } catch {
      // Pas de référentiel dans cette app : rien à garder.
    }
  }
  return dirs;
}

let checked = 0;
let leaks = 0;

for (const dir of dataDirs()) {
  for (const file of walk(dir)) {
    checked += 1;
    const source = readFileSync(file, "utf8");
    for (const line of source.split("\n")) {
      const match = /from\s+["']([^"']+)["']/u.exec(line);
      if (match === null) {
        continue;
      }
      const target = match[1];
      const hit = FORBIDDEN.find((dirName) =>
        new RegExp(`(^|/)(\\.\\./)*${dirName}/`, "u").test(target),
      );
      if (hit !== undefined) {
        leaks += 1;
        console.error(
          `✖ ${relative(ROOT, file)}\n    importe « ${target} » — ` +
            `la couche modèle du référentiel ne connaît pas « ${hit}/ »`,
        );
      }
    }
  }
}

if (leaks > 0) {
  console.error(
    `\n${leaks} fuite(s) de vocabulaire de canal dans la couche modèle du référentiel.\n` +
      `Ce qui appartient à un canal vit chez lui — cf. pim/integration/shopify-collections/.`,
  );
  process.exit(1);
}
console.log(`✓ pim-data-neutral : les ${checked} fichiers du modèle ignorent les canaux.`);

#!/usr/bin/env node
/**
 * Gate : **seul `catalog/` frappe un article scellé**.
 *
 * `CatalogArticle` porte la doctrine que le port du catalogue écrit depuis
 * toujours : « ne jamais faire confiance au prix envoyé par le client ». Son
 * `canonicalMillicents` est le nombre sur lequel s'appliquent la mercuriale, les
 * paliers, les promotions et le plancher — le fabriquer, c'est fabriquer la
 * facture.
 *
 * ## Pourquoi une porte, alors qu'il y a déjà une marque
 *
 * La clé de marque est un `unique symbol` non exporté : hors de son fichier,
 * personne ne peut la nommer, donc l'objet ne se construit pas. **Ça bloque
 * l'accident, pas la fraude** — vérifié le 2026-09-09 :
 *
 * | Ce qu'on écrit                       | TypeScript |
 * | ------------------------------------ | ---------- |
 * | `{ sku, canonicalMillicents }`       | refusé     |
 * | `{ … } as CatalogArticle`            | **compile** |
 *
 * `lint:no-type-escapes` ne refuse que `as unknown as`. Une assertion simple
 * suffirait donc à contourner la marque, et c'est cette porte-ci qui l'empêche —
 * le cran 4 de la hiérarchie, quand le cran 1 s'arrête.
 *
 * ## Ce qu'elle refuse, exactement
 *
 * Deux gestes, hors de `b2b/catalog/` :
 *
 * 1. appeler `catalogueArticle(` — la frappe ;
 * 2. écrire `as CatalogArticle` — la contrefaçon.
 *
 * ⚠️ **Les suites peuvent frapper, et c'est une correction du 2026-09-09.**
 * Une première rédaction leur appliquait la même règle, au motif qu'un cast dans
 * un test coûte plus cher qu'ailleurs (`CLAUDE.md` §6). L'argument ne vaut pas
 * ici, et l'essayer l'a montré : le cast du §6 est dangereux parce qu'il laisse
 * un **doublé dériver** du port qu'il prétend jouer. La frappe, elle, EST la
 * fonction du port — il n'y a rien dont dériver.
 *
 * Interdire aux specs de déclarer leur catalogue les forcerait à passer par un
 * double asynchrone pour éprouver une fonction pure : un test moins lisible,
 * pour une production pas plus sûre. Ce que la porte protège, c'est que le
 * **code servi** ne puisse pas fabriquer un prix ; aucun client n'est facturé
 * depuis une suite.
 *
 * ## Ce qu'elle NE refuse pas
 *
 * Lire, passer, stocker un `CatalogArticle` : partout, librement. C'est le
 * propre d'un jeton de provenance — il circule, il ne se fabrique pas.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const API = join(ROOT, "apps", "lfd-api");

/** Le seul contexte autorisé à frapper : celui qui LIT le catalogue. */
const AUTHORITY = join("src", "b2b", "catalog") + sep;

const FORGE = [
  { pattern: /\bcatalogueArticle\s*\(/g, what: "frappe un article scellé" },
  { pattern: /\bas\s+CatalogArticle\b/g, what: "contrefait la marque du catalogue" },
];

function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules" && entry !== "dist" && entry !== "client") {
        yield* sources(full);
      }
    } else if (entry.endsWith(".ts")) {
      yield full;
    }
  }
}

/** Une suite déclare son catalogue : elle ne facture personne. */
function isSpec(path) {
  return path.startsWith("test" + sep) || path.includes(sep + "__tests__" + sep);
}

const failures = [];
let inside = 0;
let inSpecs = 0;

for (const root of ["src", "test"]) {
  for (const file of sources(join(API, root))) {
    const path = relative(API, file);
    const source = readFileSync(file, "utf8");
    for (const { pattern, what } of FORGE) {
      pattern.lastIndex = 0;
      const hits = (source.match(pattern) ?? []).length;
      if (hits === 0) {
        continue;
      }
      if (path.startsWith(AUTHORITY)) {
        inside += hits;
      } else if (isSpec(path)) {
        inSpecs += hits;
      } else {
        failures.push([relative(ROOT, file), what, hits]);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("\n✗ catalogue-authority\n");
  for (const [file, what, hits] of failures) {
    console.error(`  ${file}  ${what} (${String(hits)}×) — hors de b2b/catalog/`);
  }
  console.error(
    "\n  Le prix d'entrée d'un article se LIT du catalogue, il ne se fabrique pas.\n" +
      "  Demander l'article au port plutôt que de le construire : `found.article`.\n",
  );
  process.exit(1);
}

console.log(
  `✓ catalogue-authority : la frappe vit dans b2b/catalog/, ${String(inside)} usage(s).\n` +
    `  Aucun code servi ne fabrique un prix d'entrée ; ${String(inSpecs)} usage(s) en suites,\n` +
    `  où déclarer son catalogue ne facture personne.`,
);

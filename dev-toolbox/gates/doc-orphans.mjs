#!/usr/bin/env node
/**
 * Gate : **aucune doc de `documentation/` n'est orpheline.**
 *
 * Une doc qu'aucune autre ne cite — pas même un index — ne se retrouve que si
 * l'on connaît déjà son nom. Le graphe d'Obsidian les montre (réglage partagé
 * `documentation/.obsidian/graph.json`), mais un graphe qu'on doit penser à
 * ouvrir ne garde rien ; cette porte, si. Ouverte le 2026-10-12 : cinq
 * orphelines sur 325 ce jour-là, toutes rattachées à leur index.
 *
 * Un lien compte s'il est un lien Markdown relatif (`[x](chemin.md)`) depuis
 * une AUTRE doc du dossier — la forme que `lint:doc-references` vérifie. Les
 * `[[liens wiki]]` d'Obsidian ne comptent pas : ni la porte ni GitHub ne les
 * lisent. `documentation/README.md` est la racine : rien ne la cite, et c'est
 * normal.
 *
 * Remède : citer la doc depuis l'index de son dossier (ou
 * `documentation/README.md`), ou la supprimer si elle ne sert plus.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

const ROOT = "documentation";
const ENTRY = normalize(join(ROOT, "README.md"));
const LINK = /\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g;

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".")) {
      return [];
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return markdownFiles(path);
    }
    return name.endsWith(".md") ? [normalize(path)] : [];
  });
}

const docs = markdownFiles(ROOT);
const cited = new Set();
for (const doc of docs) {
  const text = readFileSync(doc, "utf8");
  for (const match of text.matchAll(LINK)) {
    const target = normalize(join(dirname(doc), decodeURIComponent(match[1])));
    if (target !== doc) {
      cited.add(target);
    }
  }
}

const orphans = docs.filter((doc) => doc !== ENTRY && !cited.has(doc));
if (orphans.length === 0) {
  console.log(
    `✓ doc-orphans : les ${String(docs.length)} docs sont citées par au moins une autre.`,
  );
  process.exit(0);
}
console.error("\n✖ Docs orphelines — aucune autre doc ne les cite :\n");
for (const doc of orphans) {
  console.error(`  ${relative(".", doc)}`);
}
console.error(
  "\n  Citez-la depuis l'index de son dossier (ou documentation/README.md),\n" +
    "  ou supprimez-la si elle ne sert plus.\n",
);
process.exit(1);

#!/usr/bin/env node
/**
 * Gate : **un diagramme de la doc se dessine vraiment.**
 *
 * Le dépôt porte 81 blocs `mermaid` dans 41 fichiers — plus de schémas que
 * certaines applications n'ont d'écrans. Rien ne les vérifiait : un bloc mal
 * formé ne casse ni build, ni test, ni lint. Il casse **à la lecture**, chez la
 * personne venue comprendre le système, et il casse en silence — le rendu
 * affiche une croix rouge que l'auteur, lui, ne revoit jamais.
 *
 * Trois l'étaient au moment d'écrire ce gate : un backtick dans un libellé, et
 * deux `@` non quotés. Aucun n'avait été remarqué.
 *
 * ## Ce qu'il vérifie
 *
 * 1. **Chaque bloc parse**, par le vrai parseur de mermaid — pas une heuristique
 *    qui dériverait de la grammaire réelle à la première version.
 * 2. **Pas de balisage HTML dans un diagramme d'états.** C'est une règle de
 *    PORTABILITÉ, pas de syntaxe : mesuré, mermaid 11 rend parfaitement
 *    `<br/>` et `<i>` dans un `stateDiagram-v2` (SVG produit et inspecté). Mais
 *    nos docs se lisent dans WebStorm et sur GitHub, dont les moteurs embarqués
 *    ne le font pas — et c'est là qu'un diagramme de cette page est sorti
 *    illisible. Les `flowchart` et les `sequenceDiagram` gardent leurs `<br/>` :
 *    ils fonctionnent partout, et le dépôt en compte vingt-deux qui vont bien.
 *
 * ## Le coût, assumé
 *
 * C'est le premier gate à porter une dépendance (`mermaid` + `jsdom`, ~83 Mo).
 * L'alternative — réécrire un parseur — donnerait une porte qui approuve ce que
 * mermaid refuse, ce qui est pire qu'aucune porte. `jsdom` est requis par
 * `mermaid.parse` lui-même : sans DOM, DOMPurify n'est pas initialisé et tout
 * échoue, y compris le valide.
 *
 * Usage : `pnpm lint:mermaid` (branché dans `lint:gates`).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { JSDOM } from "jsdom";

const ROOT = process.cwd();

/**
 * Les diagrammes dont les libellés sont du TEXTE, pas du HTML, chez les moteurs
 * embarqués que nos lecteurs utilisent. La liste est courte et se justifie une
 * par une : l'élargir « par prudence » interdirait des `<br/>` qui rendent bien
 * partout et qui servent.
 */
const TEXT_ONLY_DIAGRAMS = ["stateDiagram-v2", "stateDiagram"];

const MARKUP = /<\/?(?:br|i|b|em|strong|span|sub|sup)\b[^>]*>/iu;

/** Un DOM minimal — `mermaid.parse` en a besoin avant même de lire la grammaire. */
function installDom() {
  const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // `navigator` n'est qu'un getter sur globalThis : l'affectation directe jette.
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
}

/** Les blocs `mermaid` d'un fichier, avec la ligne où chacun s'ouvre. */
function blocksOf(source) {
  const blocks = [];
  for (const match of source.matchAll(/```mermaid\n([\s\S]*?)```/gu)) {
    blocks.push({
      code: match[1],
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return blocks;
}

/** Le mot-clé qui ouvre le diagramme — ce qui décide des règles qui s'appliquent. */
function kindOf(code) {
  return code.trim().split("\n")[0].split(/\s/u)[0];
}

installDom();
const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false });

const files = execSync('git ls-files "*.md"', { cwd: ROOT, encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((path) => path !== "");

const broken = [];
const unportable = [];
let total = 0;

for (const file of files) {
  const source = readFileSync(`${ROOT}/${file}`, "utf8");
  for (const { code, line } of blocksOf(source)) {
    total++;
    try {
      await mermaid.parse(code);
    } catch (error) {
      broken.push([`${file}:${line}`, String(error.message).split("\n")[0]]);
      // Un bloc qui ne parse pas n'a pas de règle de portabilité à respecter :
      // le signaler deux fois enverrait chercher deux problèmes là où il y en a
      // un, et le second disparaîtra avec le premier.
      continue;
    }
    if (!TEXT_ONLY_DIAGRAMS.includes(kindOf(code))) {
      continue;
    }
    for (const [offset, text] of code.split("\n").entries()) {
      if (MARKUP.test(text)) {
        unportable.push([`${file}:${line + offset + 1}`, text.trim()]);
      }
    }
  }
}

if (broken.length > 0) {
  console.error("\n✖ Diagrammes qui ne se dessinent pas :\n");
  for (const [where, message] of broken) {
    console.error(`  ${where}\n      → ${message}`);
  }
  console.error(
    "\nLe lecteur voit une croix rouge à la place du schéma. Les causes\n" +
      "habituelles : un `@`, un backtick ou une parenthèse dans un libellé non\n" +
      "quoté — entourer le libellé de guillemets suffit presque toujours.\n",
  );
}

if (unportable.length > 0) {
  console.error("\n✖ Balisage HTML dans un diagramme d'états :\n");
  for (const [where, text] of unportable) {
    console.error(`  ${where}\n      → ${text}`);
  }
  console.error(
    "\nmermaid 11 le rend, mais les moteurs embarqués de WebStorm et GitHub\n" +
      "l'affichent LITTÉRALEMENT. Porter l'information dans une `note`, qui est\n" +
      "multiligne partout. Les flowchart et sequenceDiagram, eux, gardent leurs\n" +
      "`<br/>` : ils fonctionnent chez tout le monde.\n",
  );
}

if (broken.length > 0 || unportable.length > 0) {
  process.exit(1);
}

console.log(`✓ mermaid : les ${total} diagrammes de ${files.length} fichiers se dessinent`);

#!/usr/bin/env node
/**
 * Gate : **un document normatif ne se vide pas sans que quelqu'un le décide.**
 *
 * ## Ce qui l'a motivée, et pourquoi les autres portes l'ont laissée passer
 *
 * Le 2026-09-06, le commit `4faf6783` — qui portait sur une tout AUTRE porte,
 * celle de l'unité de l'argent — a supprimé les **888 lignes** du `CLAUDE.md` de
 * la racine. Son message n'en dit pas un mot : c'était un dommage collatéral,
 * pas une décision.
 *
 * Pendant vingt-quatre heures, les règles que tout le dépôt cite — la hiérarchie
 * des garde-fous, le port du temps, la matrice des frontières, quand `vitruve`
 * est obligatoire — n'étaient opposables **nulle part**. Seuls les deux fronts
 * avaient encore le leur.
 *
 * Vingt-cinq portes tournaient, et **aucune n'a bronché**. La raison est
 * mécanique et vaut d'être comprise : elles vérifient toutes ce qu'un fichier
 * **contient**. Un fichier vide ne contient rien de faux. `doc-references` cherche
 * des références mortes — un fichier vide n'en a aucune ; `code-language` cherche
 * des identifiants français — un fichier vide n'en a aucun ; `mermaid` cherche
 * des diagrammes qui ne se dessinent pas — un fichier vide n'en a aucun.
 *
 * **Le vide passe tous les contrôles de contenu**, parce qu'il n'a pas de
 * contenu. C'est le trou que cette porte-ci ferme, et c'est le seul.
 *
 * ## Un PLANCHER, et pas une comparaison avec hier
 *
 * La tentation était de mesurer la perte : « ce document a fondu de 90 %, refuse
 * ». Elle a été écartée, et pas par paresse.
 *
 * Une porte qui compare à l'état précédent a besoin d'un état précédent. Sur une
 * branche de vingt commits, la CI tourne sur la pointe : une troncature au
 * milieu, réparée à moitié ensuite, ne se voit plus. Sur un clone neuf, rien n'a
 * changé, donc tout est vert. Et le jour où la coupe est légitime — un document
 * scindé en deux — il faudrait une dérogation par commit, c'est-à-dire une porte
 * qu'on apprend à contourner.
 *
 * Un plancher, lui, dit une chose vraie à tout instant et depuis n'importe quel
 * point de départ : **ce document-là ne peut pas être si maigre.** Il se vérifie
 * sur un checkout nu, il ne dépend d'aucun historique, et il n'a pas d'état.
 *
 * ## Ce qu'elle N'ATTRAPE PAS, et il faut le lire
 *
 * Un document qui perd la **moitié** de sa substance en garde assez pour passer.
 * C'est le cas le plus insidieux — une section supprimée en passant, une règle
 * qui disparaît d'un paragraphe — et cette porte n'en dit rien.
 *
 * Ce qui l'attraperait est la revue du diff, c'est-à-dire le barreau du dessous
 * dans l'échelle du dépôt : *inexprimable > refusé en base > refusé par
 * l'agrégat > porte CI > relecture*. On ne prétend donc pas couvrir le sujet :
 * on couvre l'effondrement, qui est le cas où la relecture ne voit rien parce
 * qu'il n'y a plus rien à voir.
 *
 * ## Ce qui compte comme « substance »
 *
 * Ni les titres, ni les lignes vides, ni les filets, ni les séparateurs de
 * tableau, ni le contenu des blocs de code. Ce qui reste est de la **prose et
 * des lignes de tableau** — ce qu'on lit quand on lit le document.
 *
 * Le titre est exclu à dessein : un fichier réduit à `# LaFolieDouce` doit
 * échouer, et compter son titre le ferait passer pour un début de document. Un
 * bandeau daté seul, non plus, ne fait pas une convention.
 *
 * ## Le plancher a été MESURÉ, pas choisi
 *
 * Le plus maigre document du dépôt en porte **30** (`todo-agregat-company-trop-gros.md`).
 * Le plancher est à **12** : deux fois et demie de marge sous le plus petit
 * texte légitime. Il ne peut donc pas rougir sur un document réel — il rougit
 * sur un fichier vide, un titre seul, ou un moignon.
 *
 * Un plancher qu'on serre jusqu'à frôler le vrai finit désactivé au premier
 * document court et légitime. Celui-ci a de la marge par construction.
 *
 * Usage : `pnpm lint:doc-substance` (branché dans `lint:gates` dans le MÊME
 * commit qui écrit cette porte — cf. l'avertissement de `no-direct-env.mjs`,
 * restée des mois sans tourner nulle part parce que personne ne l'appelait).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/**
 * Les documents **normatifs** — ceux dont la disparition silencieuse coûte.
 *
 * Un dossier, ou un document seul. `documentation/` en entier parce qu'un
 * document d'architecture vidé se lit exactement comme un sujet jamais traité ;
 * les `CLAUDE.md` parce qu'ils sont ce que l'incident a emporté.
 */
const SCOPE = [
  "documentation",
  "CLAUDE.md",
  "apps/lfc-B2B-platform-frontend/CLAUDE.md",
  "apps/lfc-B2B-admin-frontend/CLAUDE.md",
];

/**
 * Le minimum de lignes de substance. **Mesuré**, cf. l'en-tête : le plus maigre
 * document légitime en porte 30.
 */
const FLOOR = 12;

/**
 * Les documents autorisés à être maigres, **et pourquoi**.
 *
 * Une dérogation sans raison écrite est une porte ouverte silencieuse. Vide à
 * l'écriture de la porte, et c'est le résultat voulu : un document du dépôt qui
 * ne tient pas douze lignes n'a pas encore été écrit.
 */
const ALLOWED = [];

/** Ce que le dépôt contient — `.gitignore` honoré, et le même partout. */
const everyFile = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((line) => line !== "");
const byPath = new Set(everyFile);

/** Les documents d'une entrée de scope — un dossier, ou un document seul. */
function docsUnder(entry) {
  if (byPath.has(entry)) {
    return entry.endsWith(".md") ? [entry] : [];
  }
  return everyFile.filter((file) => file.startsWith(`${entry}/`) && file.endsWith(".md"));
}

/**
 * Les lignes qui **portent quelque chose**.
 *
 * Un bloc de code clôturé est sauté en entier : cinquante lignes de YAML
 * d'exemple ne font pas d'un moignon un document.
 */
function substanceOf(text) {
  let inFence = false;
  let count = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```") || line.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line === "") {
      continue;
    }
    // Un titre annonce, il ne dit pas. Un filet et un séparateur de tableau ne
    // portent que de la mise en forme.
    if (/^#{1,6}\s/u.test(line) || /^[-*_\s]{3,}$/u.test(line) || /^\|[\s:|-]*\|?$/u.test(line)) {
      continue;
    }
    count += 1;
  }
  return count;
}

let failures = 0;
let checked = 0;
let thinnest = { doc: "", lines: Number.POSITIVE_INFINITY };

for (const entry of SCOPE) {
  for (const doc of docsUnder(entry)) {
    if (ALLOWED.includes(doc)) {
      continue;
    }
    checked += 1;
    const text = readFileSync(join(ROOT, doc), "utf8");
    const lines = substanceOf(text);
    if (lines < thinnest.lines) {
      thinnest = { doc, lines };
    }
    if (lines >= FLOOR) {
      continue;
    }
    if (failures === 0) {
      console.error("\n✗ doc-substance\n");
    }
    failures += 1;
    console.error(
      text.trim() === ""
        ? `  ${doc} — VIDE. Zéro octet de contenu.`
        : `  ${doc} — ${String(lines)} ligne(s) de substance, il en faut ${String(FLOOR)}.`,
    );
  }
}

if (failures > 0) {
  console.error(
    `\n  ${String(failures)} document(s) normatif(s) effondré(s).\n` +
      "  Un document vidé se lit comme un sujet jamais traité, et rien d'autre\n" +
      "  ne le signale : les portes de contenu passent toutes sur du vide.\n" +
      "  Restaurer depuis git, ou retirer le fichier — mais le décider.\n",
  );
  process.exit(1);
}

console.log(
  `✓ doc-substance : ${String(checked)} document(s) normatif(s) portent leur contenu.\n` +
    `  Le plus maigre : ${thinnest.doc} (${String(thinnest.lines)} lignes, plancher ${String(FLOOR)}).`,
);

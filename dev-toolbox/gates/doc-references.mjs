#!/usr/bin/env node
/**
 * Gate : **un fichier nommé dans la documentation existe encore.**
 *
 * ## Ce qui l'a motivée
 *
 * Le 2026-09-06, `P5` a daté `architecture-prix-boutique.md` et corrigé deux
 * lignes d'index. En le faisant, l'audit qui commandait ce travail s'est révélé
 * faux à son tour — écrit la veille, exact au moment de l'écriture, et déjà en
 * train de désigner le mauvais danger. Il citait aussi
 * `prisma-catalog.reader.ts:138` là où la fonction est à `:142`.
 *
 * La leçon a été écrite : **un relevé de péremption périme aussi**. Un
 * balayage de la documentation produit un nouvel état du monde, donc une
 * nouvelle chose qui périme. Quarante documents nettoyés, c'est quarante
 * horloges arrêtées à aujourd'hui.
 *
 * D'où cette porte, qui est le barreau au-dessus de la relecture dans l'échelle
 * du dépôt — *inexprimable > refusé en base > refusé par l'agrégat > porte CI >
 * relecture*. Elle ne juge pas si une phrase est encore vraie ; elle vérifie ce
 * qui est **mécaniquement vérifiable** : les fichiers que la documentation
 * nomme.
 *
 * Au premier passage : **1 086 références, 78 mortes.** Dont
 * `client/mock-shop.ts`, supprimé par `P7b`, encore cité par quatre documents.
 *
 * ## Ce qu'elle attrape, et ce qu'elle n'attrape PAS
 *
 * Elle attrape : un fichier renommé, déplacé, supprimé ; un lien relatif vers
 * un document qui n'a jamais existé ; une ligne au-delà de la fin d'un fichier.
 *
 * Elle **n'attrape pas** : une décision renversée, une phrase devenue fausse,
 * et — le cas le plus fréquent — un `fichier.ts:138` qui pointe **dans** le
 * fichier mais sur la mauvaise ligne. Celui-là est indétectable sans
 * sémantique, et c'est précisément celui que l'audit a produit. C'est une
 * limite, pas un oubli : elle est écrite ici pour que personne ne croie la
 * documentation vérifiée parce que cette porte est verte.
 *
 * ## Pourquoi les blocs de code sont ignorés
 *
 * Une portion `entre backticks simples` est une **affirmation** — l'auteur dit
 * que ce fichier existe. Un bloc de code clôturé est une **citation**, souvent
 * illustrative, et il porte des chemins inventés à dessein (`chemin/vers/x.ts`).
 * Les traiter pareil ferait crier la porte sur des exemples, et une porte qui
 * crie à tort finit désactivée.
 *
 * ## Le motif du SCOPE qui grandit
 *
 * Le même que `code-language` et `fold-typography` : les dossiers **drainés**
 * échouent à la première référence morte, tout le reste est **compté et
 * affiché**. Taire la dette restante serait pire que de ne pas avoir de porte —
 * on croirait le travail fini. Ajouter un dossier au SCOPE, c'est déclarer
 * l'avoir drainé.
 *
 * ⚠️ Le solde hors scope est **affiché, pas asserté**. Le figer sur un nombre
 * en ferait un cliquet que personne ne pourrait bouger sans toucher à la porte,
 * et la réponse à une dérive n'est pas de négocier un nombre : c'est de drainer
 * un dossier de plus.
 *
 * ## 🔴 Ce qui EXISTE se demande à git, pas au disque
 *
 * La première version parcourait le système de fichiers avec une liste de
 * dossiers à sauter. Elle a résolu `mail-templates.ts` et `invitation-expiry.ts`
 * contre `apps/lfd-api/dist-seed/` — une sortie de build oubliée là. Une porte
 * qui accepte une référence parce qu'un artefact périmé traîne sur MA machine
 * ne vérifie rien du tout, et serait verte chez moi, rouge en CI.
 *
 * `git ls-files` rend exactement ce que le dépôt contient, `.gitignore`
 * honoré, identique partout. La liste de dossiers à sauter disparaît avec — et
 * une liste qu'on n'écrit pas ne dérive pas.
 *
 * Usage : `pnpm lint:doc-references` (branché dans `lint:gates` dans le MÊME
 * commit qui écrit cette porte — cf. l'avertissement de `no-direct-env.mjs`,
 * restée des mois sans tourner nulle part).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const ROOT = process.cwd();

/** Les dossiers dont la dette est purgée. En ajouter un = l'avoir drainé. */
const SCOPE = [
  // Drainés le 2026-09-06, en écrivant la porte. `b2b` d'abord parce que c'est
  // là que le travail se fait, et que ses références mortes pointaient toutes
  // vers des fichiers supprimés par des chantiers de la même semaine.
  "documentation/b2b",
  "documentation/ops",
];

/**
 * Tout le reste, pour que le solde restant soit visible et non silencieux.
 *
 * Un dossier hors liste n'est pas « sans dette » : il est **sans mesure**, ce
 * qui se lit pareil et ne vaut rien.
 */
const WATCHED = ["documentation"];

/**
 * Les seuls documents dont les références ne sont pas comptées, **et pourquoi**.
 *
 * Une dérogation sans raison écrite est une porte ouverte silencieuse.
 */
const EXCLUDED = [
  // Sources ARCHIVÉES, non normatives, et leur en-tête le dit : des propositions
  // reçues de l'extérieur, conservées pour tracer un raisonnement, dont les
  // exemples visent une autre stack (TypeORM). Leurs chemins ne décrivent pas ce
  // dépôt et ne le décriront jamais.
  "documentation/pim/data-model/_sources",
];

/** Les extensions qu'on tient pour des fichiers du dépôt. */
const EXT = "ts|tsx|js|mjs|cjs|html|scss|css|json|prisma|sql|md|yml|yaml";
const REFERENCE = new RegExp(`^([A-Za-z0-9_./@-]+\\.(?:${EXT}))(?::(\\d+))?$`, "u");
/** Une portion entre backticks SIMPLES — une affirmation, pas une citation. */
const INLINE = /`([^`\n]+)`/gu;

/** Ce que le dépôt contient — `.gitignore` honoré, et le même partout. */
const everyFile = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((line) => line !== "");
const byPath = new Set(everyFile);
const byName = new Map();
for (const path of everyFile) {
  const name = basename(path);
  if (!byName.has(name)) {
    byName.set(name, path);
  }
}

/**
 * Le chemin du dépôt que cette référence désigne, ou `null`.
 *
 * Quatre formes, toutes employées dans la documentation :
 *
 * 1. `../ops/pipelines.md` — relatif au document qui le porte ;
 * 2. `.../account/domain/activation-gate.ts` — abrégé par la tête, donc un
 *    suffixe ;
 * 3. `apps/lfd-api/src/…/order.ts` — complet depuis la racine ;
 * 4. `order.ts` — le seul nom, résolu s'il n'est pas ambigu au point d'être
 *    faux : on ne vérifie alors que l'EXISTENCE d'un fichier ainsi nommé.
 */
function resolveReference(path, doc) {
  if (path.startsWith("./") || path.startsWith("../")) {
    const target = relative(ROOT, resolve(join(ROOT, doc), "..", path));
    return byPath.has(target) ? target : null;
  }
  if (byPath.has(path)) {
    return path;
  }
  const needle = path.startsWith(".../") ? path.slice(3) : `/${path}`;
  const suffix = everyFile.find((file) => `/${file}`.endsWith(needle));
  if (suffix !== undefined) {
    return suffix;
  }
  return path.includes("/") ? null : (byName.get(basename(path)) ?? null);
}

/** Les références mortes d'un document, avec ce qui cloche. */
function deadIn(doc) {
  const found = [];
  const lines = readFileSync(join(ROOT, doc), "utf8").split("\n");
  lines.forEach((text, index) => {
    for (const match of text.matchAll(INLINE)) {
      const raw = match[1].trim();
      const hit = REFERENCE.exec(raw);
      if (hit === null) {
        continue;
      }
      const [, path, lineNumber] = hit;
      // Un glob (`*.spec.ts`) et un motif de SUFFIXE (`.e2e-spec.ts`) décrivent
      // une famille de fichiers, pas un fichier. Il n'y a rien à vérifier.
      const isSuffixPattern =
        path.startsWith(".") && !/^\.{1,3}\//u.test(path.slice(0, 4)) && !path.startsWith("./");
      if (path.includes("*") || isSuffixPattern) {
        continue;
      }
      const resolved = resolveReference(path, doc);
      if (resolved === null) {
        found.push([index + 1, raw, "fichier introuvable"]);
        continue;
      }
      if (lineNumber !== undefined) {
        const count = readFileSync(join(ROOT, resolved), "utf8").split("\n").length;
        if (Number(lineNumber) > count) {
          found.push([index + 1, raw, `le fichier n'a que ${String(count)} lignes`]);
        }
      }
    }
  });
  return found;
}

const excluded = EXCLUDED.map((dir) => `${dir}/`);
const drained = SCOPE.map((dir) => `${dir}/`);

function docsUnder(dir) {
  return everyFile.filter(
    (file) =>
      file.startsWith(`${dir}/`) &&
      file.endsWith(".md") &&
      !excluded.some((skip) => file.startsWith(skip)),
  );
}

let failures = 0;
for (const dir of SCOPE) {
  for (const doc of docsUnder(dir)) {
    for (const [line, raw, why] of deadIn(doc)) {
      if (failures === 0) {
        console.error("\n✗ doc-references\n");
      }
      failures += 1;
      console.error(`  ${doc}:${String(line)}  \`${raw}\` — ${why}`);
    }
  }
}

let remaining = 0;
let counted = 0;
for (const dir of WATCHED) {
  for (const doc of docsUnder(dir)) {
    if (drained.some((path) => doc.startsWith(path))) {
      continue;
    }
    counted += 1;
    remaining += deadIn(doc).length;
  }
}

if (failures > 0) {
  console.error(
    `\n  ${String(failures)} référence(s) morte(s) dans un dossier drainé.\n` +
      "  Repointer, ou retirer la référence — une phrase qui nomme un fichier\n" +
      "  disparu gèle le chantier de celui qui la lit.\n",
  );
  process.exit(1);
}

console.log(
  `✓ doc-references : ${String(SCOPE.length)} dossier(s) drainé(s), 0 référence morte.\n` +
    `  Hors scope : ${String(remaining)} morte(s) sur ${String(counted)} document(s) — compté, pas ignoré.`,
);

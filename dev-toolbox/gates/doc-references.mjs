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
 * ## Elle regarde dans les DEUX sens
 *
 * Un document qui nomme un fichier, et un fichier qui nomme un document. Le
 * second sens a été ajouté après coup, et pour une raison qui ne se devine
 * pas : en déplaçant douze documents dans `documentation/pricing/`, treize
 * fichiers de code se sont mis à citer un chemin mort — un `schema.prisma`,
 * quatre migrations, sept sources, et **un test que je venais d'écrire**. La
 * porte n'a rien vu, parce qu'elle ne lisait que `documentation/`.
 *
 * Une porte qui ne vérifie qu'un sens rend l'autre plus dangereux : on croit le
 * sujet couvert.
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
 * ## Les CONVENTIONS y sont entrées le 2026-09-07, et voilà pourquoi
 *
 * La porte ne lisait que `documentation/`. Le 2026-09-06, un commit portant sur
 * une tout AUTRE porte a vidé `CLAUDE.md` de ses 888 lignes sans le mentionner
 * dans son message — un dommage collatéral. Personne ne l'a vu pendant
 * vingt-quatre heures : le seul document qui édicte les règles du dépôt était le
 * seul qu'aucune porte ne lisait.
 *
 * ⚠️ **Cette porte-ci n'aurait PAS attrapé ce cas-là**, et il faut le dire pour
 * que personne ne croie le sujet clos : un fichier vide n'a aucune référence
 * morte, donc elle serait restée verte. Ce qu'elle apporte est plus modeste et
 * bien réel — les trois `CLAUDE.md` nomment des dizaines de fichiers, et un
 * renommage les périme comme il périme un document. Le VIDE demande une autre
 * porte, et elle reste à écrire.
 *
 * Au premier passage sur eux : **trois références mortes**, toutes dans le front
 * plateforme — un `delivery-format.ts` parti dans `@lfd/b2b-ui` sans que le
 * texte suive, un `x.spec.ts` qui était un gabarit affirmé comme un fichier, et
 * un typage de dépendance que la porte prenait pour un mort.
 *
 * ## Le SCOPE a fini de grandir
 *
 * Le motif est celui de `code-language` et `fold-typography` : les dossiers
 * **drainés** échouent à la première référence morte, tout le reste est compté
 * et affiché. Ici il n'a pas eu à durer — `documentation/b2b` et
 * `documentation/ops` ont été drainés en écrivant la porte, le reste dans la
 * foulée. **Le solde est nul, et la porte affiche la TAILLE de son vert** :
 * « 0 morte » ne veut rien dire sans le nombre de choses regardées, puisqu'une
 * porte qui ne vérifie rien rend le même message.
 *
 * ## Ce que les backticks veulent dire, et c'est ce qui rend la porte possible
 *
 * **Une portion entre backticks affirme que ce fichier existe MAINTENANT.** Ce
 * qui est supprimé, produit par un build, ou seulement prévu se nomme en texte
 * simple.
 *
 * Sans cette convention, la porte serait ingouvernable : un document qui dit
 * « vat-rates.ts est supprimé » rougirait pour avoir dit vrai, et il faudrait
 * une liste d'exceptions qui finirait par tout contenir. Avec elle, la règle
 * tient en une phrase et le drainage devient un geste d'écriture plutôt qu'une
 * négociation.
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
import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const ROOT = process.cwd();

/**
 * Ce dont la dette est purgée : des **dossiers**, et des **documents isolés**.
 * En ajouter un = l'avoir drainé.
 */
const SCOPE = [
  // Drainés le 2026-09-06, en écrivant la porte. `b2b` d'abord parce que c'est
  // là que le travail se fait, et que ses références mortes pointaient toutes
  // vers des fichiers supprimés par des chantiers de la même semaine.
  // `b2b` et `ops` le 2026-09-06 en écrivant la porte, le reste dans la foulée.
  // Le dossier entier : il n'y a plus de solde.
  "documentation",

  // ── Les CONVENTIONS, ajoutées le 2026-09-07 ───────────────────────────────
  //
  // 🔴 Elles manquaient, et le trou a coûté. Le 2026-09-06, un commit sur une
  // tout autre porte a VIDÉ `CLAUDE.md` de ses 888 lignes sans le mentionner
  // dans son message. Personne ne l'a vu pendant vingt-quatre heures : le seul
  // document qui édicte les règles du dépôt — la hiérarchie des garde-fous, le
  // port du temps, la matrice des frontières — était le seul qu'aucune porte ne
  // lisait.
  //
  // ⚠️ Cette porte-ci n'aurait PAS attrapé ce cas-là : un fichier vide n'a
  // aucune référence morte, donc elle serait restée verte. Ce qu'elle apporte
  // est plus modeste et bien réel — les conventions nomment des dizaines de
  // fichiers, et un renommage les périme comme il périme un document. Le vide,
  // lui, demande une autre porte, et elle reste à écrire.
  "CLAUDE.md",
  "apps/lfc-B2B-platform-frontend/CLAUDE.md",
  "apps/lfc-B2B-admin-frontend/CLAUDE.md",
];

/**
 * Tout le reste, pour que le solde restant soit visible et non silencieux.
 *
 * Un dossier hors liste n'est pas « sans dette » : il est **sans mesure**, ce
 * qui se lit pareil et ne vaut rien.
 */
const WATCHED = [
  "documentation",
  "CLAUDE.md",
  "apps/lfc-B2B-platform-frontend/CLAUDE.md",
  "apps/lfc-B2B-admin-frontend/CLAUDE.md",
];

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
/**
 * La CIBLE d'un lien markdown — `](chemin)`.
 *
 * Vérifiée comme une référence, et pour une raison plus forte : un lien mort ne
 * se lit pas comme une phrase périmée, il se lit comme un clic qui ne mène nulle
 * part. Il y en a 425 dans ce dossier ; les taire pendant qu'on vérifie les
 * backticks aurait été un choix arbitraire.
 *
 * Une ancre (`#section`) et une URL sont laissées : la première ne désigne pas
 * un fichier, la seconde ne désigne pas ce dépôt.
 */
const LINK = /\]\(([^)\s]+)\)/gu;

/** Ce que le dépôt contient — `.gitignore` honoré, et le même partout. */
const everyFile = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((line) => line !== "");
const byPath = new Set(everyFile);
/** Par nom de fichier : le premier trouvé, et **combien** le portent. */
const byName = new Map();
for (const path of everyFile) {
  const name = basename(path);
  const seen = byName.get(name);
  if (seen === undefined) {
    byName.set(name, { first: path, count: 1 });
  } else {
    seen.count += 1;
  }
}

/**
 * Le chemin du dépôt que cette référence désigne, et s'il est **certain**.
 *
 * Quatre formes, toutes employées dans la documentation :
 *
 * 1. `../ops/pipelines.md` — relatif au document qui le porte ;
 * 2. `.../account/domain/activation-gate.ts` — abrégé par la tête, un suffixe ;
 * 3. `apps/lfd-api/src/…/order.ts` — complet depuis la racine ;
 * 4. `order.ts` — le seul nom.
 *
 * 🔴 **`unique` n'est pas de la coquetterie.** Vingt-neuf fichiers de ce dépôt
 * s'appellent `index.ts` ; un `index.ts:213` se résout donc sur le premier venu,
 * et la porte a **inventé une erreur** en annonçant qu'un fichier de trois
 * lignes n'en avait pas 213. Une existence se prouve sur n'importe quelle
 * correspondance ; un numéro de ligne ne se vérifie que sur une seule.
 *
 * ⚠️ **Un import ESM cite `.js` pour un fichier `.ts`** — c'est la résolution
 * `NodeNext` de tout le dépôt, et la documentation recopie les imports tels
 * qu'ils sont écrits. Une référence en `.js` qui ne trouve rien est donc
 * réessayée en `.ts` avant d'être déclarée morte.
 */
function resolveReference(path, doc) {
  if (path.startsWith("./") || path.startsWith("../")) {
    const target = relative(ROOT, resolve(join(ROOT, doc), "..", path));
    return byPath.has(target) ? { file: target, unique: true } : null;
  }
  if (byPath.has(path)) {
    return { file: path, unique: true };
  }
  const needle = path.startsWith(".../") ? path.slice(3) : `/${path}`;
  const suffix = everyFile.filter((file) => `/${file}`.endsWith(needle));
  if (suffix.length > 0) {
    return { file: suffix[0], unique: suffix.length === 1 };
  }
  if (!path.includes("/")) {
    const named = byName.get(basename(path));
    if (named !== undefined) {
      return { file: named.first, unique: named.count === 1 };
    }
  }
  // Le dernier recours : la résolution ESM du dépôt écrit `.js` là où le
  // fichier est un `.ts`.
  const asTypeScript = path.replace(/\.(?:js|mjs|cjs)$/u, ".ts");
  return asTypeScript === path ? null : resolveReference(asTypeScript, doc);
}

/**
 * Combien de références ce document affirme — mortes ou vives.
 *
 * Affiché pour que le vert de la porte ait une taille. « 0 morte » ne veut rien
 * dire sans le nombre de choses regardées : une porte qui ne vérifie rien rend
 * exactement le même message.
 */
function referencesIn(doc) {
  let count = 0;
  const text = readFileSync(join(ROOT, doc), "utf8");
  for (const line of text.split("\n")) {
    for (const match of line.matchAll(INLINE)) {
      if (REFERENCE.test(match[1].trim())) {
        count += 1;
      }
    }
    for (const match of line.matchAll(LINK)) {
      if (linkTarget(match[1]) !== null) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Pourquoi la référence ne résout pas.
 *
 * Un fichier PRÉSENT sur le disque mais absent de `git ls-files` est le cas le
 * plus fréquent en écrivant : on vient de le créer et on ne l'a pas encore
 * ajouté. Le dire évite de chercher une faute de frappe qui n'existe pas.
 */
function whyMissing(path) {
  return existsSync(join(ROOT, path))
    ? "présent sur le disque mais pas suivi par git — `git add` ?"
    : "fichier introuvable";
}

/**
 * La cible d'un lien existe-t-elle — fichier **ou dossier** ?
 *
 * Un lien markdown vers un DOSSIER est légitime : `[le modèle](./data-model/)`
 * s'ouvre. Le résolveur de références ne connaît que des fichiers, parce qu'une
 * phrase qui nomme un fichier nomme un fichier ; un lien, lui, peut mener à un
 * rayon.
 */
function targetExists(path, doc) {
  if (resolveReference(path, doc) !== null) {
    return true;
  }
  const asDirectory = relative(ROOT, resolve(join(ROOT, doc), "..", path)).replace(/\/$/u, "");
  return everyFile.some((file) => file.startsWith(`${asDirectory}/`));
}

/** Le chemin qu'un lien vise, ou `null` s'il ne vise pas un fichier du dépôt. */
function linkTarget(href) {
  if (href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(href)) {
    return null;
  }
  const withoutAnchor = href.split("#")[0];
  return withoutAnchor === "" ? null : decodeURI(withoutAnchor);
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
      // Un chemin sous `node_modules/` désigne une DÉPENDANCE — les typages
      // d'une bibliothèque, par exemple. Il est réel, il est utile à nommer, et
      // il ne sera JAMAIS dans `git ls-files`. Le déclarer mort dirait le
      // contraire de la vérité ; le vérifier demanderait que la porte dépende
      // d'un `install`, donc qu'elle soit verte ou rouge selon la machine.
      if (path.startsWith("node_modules/") || path.includes("/node_modules/")) {
        continue;
      }
      // Un glob (`*.spec.ts`) et un motif de SUFFIXE (`.e2e-spec.ts`) décrivent
      // une famille de fichiers, pas un fichier. Il n'y a rien à vérifier.
      const isSuffixPattern =
        path.startsWith(".") && !/^\.{1,3}\//u.test(path.slice(0, 4)) && !path.startsWith("./");
      if (path.includes("*") || isSuffixPattern) {
        continue;
      }
      const resolved = resolveReference(path, doc);
      if (resolved === null) {
        found.push([index + 1, raw, whyMissing(path)]);
        continue;
      }
      // Un numéro de ligne ne se vérifie que si l'on sait DE QUEL fichier on
      // parle. Sur un nom porté par vingt-neuf fichiers, on ne le sait pas.
      if (lineNumber !== undefined && resolved.unique) {
        const count = readFileSync(join(ROOT, resolved.file), "utf8").split("\n").length;
        if (Number(lineNumber) > count) {
          found.push([index + 1, raw, `le fichier n'a que ${String(count)} lignes`]);
        }
      }
    }
    for (const match of text.matchAll(LINK)) {
      const target = linkTarget(match[1]);
      if (target === null) {
        continue;
      }
      const from = target.startsWith("./") || target.startsWith("../") ? target : `./${target}`;
      if (!targetExists(from, doc)) {
        found.push([index + 1, `](${match[1]})`, "lien mort"]);
      }
    }
  });
  return found;
}

const excluded = EXCLUDED.map((dir) => `${dir}/`);
const drained = SCOPE.map((entry) => (byPath.has(entry) ? entry : `${entry}/`));

/**
 * Les documents d'une entrée de scope — un **dossier** ou un **document seul**.
 *
 * Les deux formes cohabitent depuis que les `CLAUDE.md` sont couverts : ce sont
 * des documents isolés à la racine de ce qu'ils régissent, et exiger un dossier
 * aurait obligé à en inventer un pour trois fichiers.
 */
function docsUnder(entry) {
  if (byPath.has(entry)) {
    return entry.endsWith(".md") ? [entry] : [];
  }
  return everyFile.filter(
    (file) =>
      file.startsWith(`${entry}/`) &&
      file.endsWith(".md") &&
      !excluded.some((skip) => file.startsWith(skip)),
  );
}

/**
 * Les documents cités **depuis le code** — commentaires, migrations, schéma.
 *
 * Même prédicat que dans l'autre sens : un chemin nommé désigne un fichier qui
 * existe. Pas de backticks à respecter ici, le chemin se reconnaît seul.
 */
const DOC_PATH = /documentation\/[A-Za-z0-9_./-]+\.md/gu;

function deadDocPathsIn(file) {
  const found = [];
  readFileSync(join(ROOT, file), "utf8")
    .split("\n")
    .forEach((text, index) => {
      for (const match of text.matchAll(DOC_PATH)) {
        if (!byPath.has(match[0])) {
          found.push([index + 1, match[0], whyMissing(match[0])]);
        }
      }
    });
  return found;
}

let failures = 0;
let checked = 0;
let documents = 0;
for (const dir of SCOPE) {
  for (const doc of docsUnder(dir)) {
    documents += 1;
    checked += referencesIn(doc);
    for (const [line, raw, why] of deadIn(doc)) {
      if (failures === 0) {
        console.error("\n✗ doc-references\n");
      }
      failures += 1;
      console.error(`  ${doc}:${String(line)}  \`${raw}\` — ${why}`);
    }
  }
}

// L'autre sens : le code qui nomme un document.
//
// ⚠️ **`existsSync` en plus de `git ls-files`**, et ce n'est pas une ceinture de
// sécurité : l'index git connaît un fichier SUPPRIMÉ mais pas encore indexé, et
// la porte mourait alors sur un `ENOENT` — une trace de pile Node, là où le
// travail en cours était simplement un `git rm` non fait. Une porte qui plante
// au lieu de dire ce qu'elle reproche se contourne au lieu de se lire
// (constaté le 2026-09-09, en déplaçant un fichier).
const SOURCES = everyFile.filter(
  (file) =>
    !file.startsWith("documentation/") &&
    /\.(?:ts|tsx|mjs|cjs|js|prisma|sql|html|json)$/u.test(file) &&
    existsSync(join(ROOT, file)),
);
for (const file of SOURCES) {
  for (const [line, raw, why] of deadDocPathsIn(file)) {
    if (failures === 0) {
      console.error("\n✗ doc-references\n");
    }
    failures += 1;
    checked += 1;
    console.error(`  ${file}:${String(line)}  ${raw} — ${why}`);
  }
}
const citedFromCode = SOURCES.reduce(
  (sum, file) => sum + (readFileSync(join(ROOT, file), "utf8").match(DOC_PATH)?.length ?? 0),
  0,
);
checked += citedFromCode;

let remaining = 0;
let counted = 0;
for (const dir of WATCHED) {
  for (const doc of docsUnder(dir)) {
    if (drained.some((path) => doc === path || doc.startsWith(path))) {
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
  counted === 0
    ? `✓ doc-references : ${String(checked)} référence(s) vérifiée(s), 0 morte.\n` +
        `  ${String(documents)} document(s) qui nomment des fichiers, et ${String(citedFromCode)} chemin(s) de doc cité(s) depuis le code.`
    : `✓ doc-references : ${String(SCOPE.length)} dossier(s) drainé(s), 0 référence morte.\n` +
        `  Hors scope : ${String(remaining)} morte(s) sur ${String(counted)} document(s) — compté, pas ignoré.`,
);

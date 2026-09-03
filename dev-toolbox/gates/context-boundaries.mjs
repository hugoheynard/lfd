#!/usr/bin/env node
/**
 * Gate : **un bloc n'importe un autre bloc que s'il en a le droit.**
 *
 * Aujourd'hui, ce qui empêche le PIM d'importer le moteur de prix du B2B, c'est
 * le **réseau** : les deux vivent dans deux processus. Le jour où ils se
 * rejoignent (cf. `documentation/suite/architecture-topologie-apps.md`, étape
 * B2), ce mur disparaît — et rien ne le remplace tout seul. En six mois,
 * quelqu'un écrit l'import qui traverse, personne ne le voit en revue, et le
 * monolithe modulaire devient une god app.
 *
 * Ce gate est le mur de remplacement. Il est posé **avant** la fusion (étape
 * B1) et pas après, parce qu'un mur qu'on ajoute une fois la brèche ouverte ne
 * ferme plus rien : il ne fait que constater.
 *
 * Ce qu'il vérifie, et rien d'autre : un fichier d'un bloc n'importe un fichier
 * d'un autre bloc que si la matrice l'autorise. Il ne dit rien de la qualité de
 * l'import, ni de son sens — seulement de sa **direction**.
 *
 * Usage : `pnpm lint:context-boundaries` (branché en CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = "apps/lfd-api/src";

/**
 * **À quel bloc appartient chaque dossier de premier niveau.**
 *
 * C'est la seule donnée à tenir à jour : le jour où `pim/` arrive, une ligne
 * suffit. Un dossier absent de cette table fait **échouer** le gate plutôt que
 * d'être ignoré — un nouveau contexte doit choisir son camp, pas se glisser
 * entre les mailles.
 */
const BLOCK_OF = {
  // ▸ LE SOCLE PARTAGÉ — il dit qui est qui et qui peut quoi.
  staff: "staff",

  // ▸ LA PLATEFORME MARCHANDE.
  b2b: "b2b",

  // ▸ LE RÉFÉRENTIEL — arrivé en B2c, avec sa base et ses canaux.
  pim: "pim",

  // ▸ LA RACINE DE COMPOSITION — le seul endroit qui a le droit de connaître
  //   tout le monde, parce que son unique travail est de relier les blocs
  //   entre eux. Personne ne l'importe en retour : un contexte qui remonte
  //   vers la racine s'est mis à dépendre de l'assemblage.
  appBootstrap: "root",

  // ▸ TECHNIQUE PURE — zéro connaissance métier.
  platform: "platform",

  // ▸ LA CARTE DE SANTÉ — il OBSERVE, il ne possède rien. N'ayant aucun métier,
  //   il n'a rien à lire chez les autres blocs : sa ligne est la plus stricte
  //   de la matrice, et personne ne l'importe en retour. C'est aussi ce qui
  //   rendra son déménagement facile le jour où il deviendra sa propre app.
  ops: "ops",
};

/**
 * **Qui a le droit d'importer qui.** Courte exprès : si elle ne tient pas en
 * cinq lignes, le découpage est faux.
 *
 * Depuis le découpage cible, un bloc **est** un dossier de premier niveau : la
 * table ci-dessus tient en cinq lignes parce que l'arborescence la dessine. Il
 * a fallu treize entrées tant que onze contextes marchands vivaient à la racine
 * — la frontière existait, mais il fallait la lire dans un fichier de gate au
 * lieu de la voir en ouvrant `src/`.
 *
 * Les deux lectures qui comptent :
 *
 * - **`staff` ne connaît personne.** S'il connaissait le B2B, on ne pourrait
 *   plus le poser devant le PIM — or c'est précisément ce qu'on veut faire ;
 * - **`platform` ne connaît aucun contexte.** Une brique technique qui sait
 *   qu'un annuaire staff existe n'est plus une brique technique.
 *
 * `root` est l'exception qui rend les autres tenables : quelqu'un doit bien
 * relier un port à son implémentation quand les deux vivent de part et d'autre
 * d'une frontière. Ce quelqu'un est la racine de composition, et elle seule —
 * c'est pourquoi aucun bloc ne la contient en retour.
 */
const ALLOWED = {
  staff: new Set(["platform"]),
  pim: new Set(["staff", "platform"]),
  b2b: new Set(["staff", "pim", "platform"]),
  platform: new Set([]),
  ops: new Set(["platform"]),
  root: new Set(["staff", "pim", "b2b", "platform", "ops"]),
};

/**
 * **« Port uniquement » — la matrice le disait en prose, ceci le tient.**
 *
 * `CLAUDE.md` §3 écrit `b2b → pim : port uniquement`, et la table `ALLOWED`
 * ci-dessus ne sait dire qu'une **direction**. Elle autorisait donc `b2b → pim`
 * sans réserve, là où la règle dit « par la porte que le référentiel publie ».
 * L'écart n'était pas théorique : deux fonctions concrètes de `pim/allergens/`
 * étaient déjà importées.
 *
 * Ce que « port uniquement » veut dire concrètement, et pourquoi ce préfixe :
 * `pim/channels/b2b-platform/` **est** le canal que le référentiel publie POUR
 * la plateforme marchande. Ce qu'on y trouve est fait pour être consommé de
 * l'extérieur — `B2bCatalogDriver`, `B2bCatalogFeedPreview`,
 * `B2bDeliveryFactsReader` sont des classes abstraites. Le reste de `pim/` est
 * l'intérieur du référentiel : ses tables, ses règles, son vocabulaire.
 *
 * La frontière est donc un **chemin**, pas une convention de nommage — un
 * dossier se voit en ouvrant `src/`, un suffixe `.port.ts` se discute.
 *
 * @type {Record<string, string>}
 */
const PORT_SURFACE = {
  "b2b→pim": "pim/channels/b2b-platform/",
};

/**
 * Les franchissements **connus**, tolérés le temps de l'étape B2.
 *
 * Chacun porte sa raison et sa cible. Une entrée sans raison n'est pas une
 * exception, c'est un oubli — et la liste ne grandit pas : elle se vide.
 */
/**
 * Les franchissements **connus**, tolérés le temps de l'étape B2.
 *
 * Chacun porte sa raison et sa cible. Une entrée sans raison n'est pas une
 * exception, c'est un oubli — et la liste ne grandit pas : elle se vide.
 *
 * Vide depuis le 2026-08-19 : les sept franchissements trouvés à la pose du gate
 * ont tous été résorbés. Une entrée qui réapparaît ici doit donc porter une
 * décision, pas une commodité.
 */
const KNOWN = new Map([
  [
    "b2b/catalog/infrastructure/prisma-catalog-admin.reader.ts → pim/allergens/allergen-mapping.js",
    "Ouvert le 2026-09-03 avec la surface de port. Ce lecteur RECALCULE les " +
      "mentions d'étiquette à partir des codes stockés, alors que " +
      "`catalog_items.allergen_labels` porte déjà ce que le PIM a projeté à " +
      "l'émission (D6). Il y a donc deux sources de libellés dans le B2B, et " +
      "l'écran d'administration lit la mauvaise. Le retrait est un ARBITRAGE, " +
      "pas un remplacement : les articles reçus avant la v5 du fil n'ont pas " +
      "de mentions tant qu'un push complet n'a pas eu lieu, et l'affichage " +
      "d'allergènes est une surface réglementaire en service.",
  ],
  [
    "b2b/catalog/infrastructure/prisma-catalog-admin.reader.ts → pim/allergens/allergen-projection.js",
    "Même arbitrage que `allergen-mapping.js` — `toInco` est l'autre moitié du " +
      "recalcul. Les deux partent ensemble ou pas du tout.",
  ],
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules" && entry !== "client" && entry !== "dist") {
        yield* walk(path);
      }
    } else if (path.endsWith(".ts")) {
      yield path;
    }
  }
}

/** Le dossier de premier niveau d'un chemin relatif à `SRC`, ou `null` à la racine. */
function topOf(relativePath) {
  const [first, ...rest] = relativePath.split("/");
  return rest.length === 0 ? null : first;
}

/**
 * La cible d'un import relatif, ramenée à un dossier de premier niveau.
 *
 * Les imports de paquets (`@lfd/…`, `@nestjs/…`) ne sont pas concernés : la
 * frontière qu'on tient ici est **interne** à l'application.
 */
function importedPath(fromRelative, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const segments = fromRelative.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") {
      segments.pop();
    } else if (part !== ".") {
      segments.push(part);
    }
  }
  const path = segments.join("/");
  const top = topOf(path);
  return top === null ? null : { top, path };
}

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;

const unknownDirs = new Set();
const violations = [];
const offSurface = [];
const unusedExceptions = new Set(KNOWN.keys());

for (const absolute of walk(join(ROOT, SRC))) {
  const fromRelative = relative(join(ROOT, SRC), absolute);
  const fromTop = topOf(fromRelative);
  if (fromTop === null) {
    continue;
  }
  const fromBlock = BLOCK_OF[fromTop];
  if (fromBlock === undefined) {
    unknownDirs.add(fromTop);
    continue;
  }

  const source = readFileSync(absolute, "utf8");
  for (const match of source.matchAll(IMPORT)) {
    const target = importedPath(fromRelative, match[1]);
    if (target === null || target.top === fromTop) {
      continue;
    }
    const toBlock = BLOCK_OF[target.top];
    if (toBlock === undefined) {
      unknownDirs.add(target.top);
      continue;
    }
    if (toBlock === fromBlock) {
      continue;
    }
    if (!ALLOWED[fromBlock].has(toBlock)) {
      const key = `${fromRelative} → ${target.top}`;
      if (KNOWN.has(key)) {
        unusedExceptions.delete(key);
        continue;
      }
      violations.push({ key, fromBlock, toBlock });
      continue;
    }
    // La direction est permise ; reste à savoir PAR OÙ.
    const surface = PORT_SURFACE[`${fromBlock}→${toBlock}`];
    if (surface === undefined || target.path.startsWith(surface)) {
      continue;
    }
    const key = `${fromRelative} → ${target.path}`;
    if (KNOWN.has(key)) {
      unusedExceptions.delete(key);
      continue;
    }
    offSurface.push({ key, fromBlock, toBlock, surface });
  }
}

let failed = false;

if (unknownDirs.size > 0) {
  failed = true;
  console.error("\n❌ Dossiers de premier niveau sans bloc déclaré :\n");
  for (const dir of [...unknownDirs].sort()) {
    console.error(`   ${SRC}/${dir}`);
  }
  console.error("\n   Un nouveau contexte choisit son camp : ajoute-le à BLOCK_OF.");
}

if (violations.length > 0) {
  failed = true;
  console.error("\n❌ Franchissements de frontière :\n");
  for (const { key, fromBlock, toBlock } of violations) {
    console.error(`   ${key}\n      ${fromBlock} → ${toBlock} : interdit par la matrice.`);
  }
  console.error(
    "\n   Le franchissement passe par un PORT déclaré chez l'appelant, jamais par un import direct.",
  );
}

if (offSurface.length > 0) {
  failed = true;
  console.error("\n❌ Franchissements HORS de la surface publiée :\n");
  for (const { key, fromBlock, toBlock, surface } of offSurface) {
    console.error(
      `   ${key}\n      ${fromBlock} → ${toBlock} est permis, mais par ${SRC}/${surface} uniquement.`,
    );
  }
  console.error("\n   Ce qui manque se publie dans le canal, en classe ABSTRAITE — on n'atteint");
  console.error("   pas l'intérieur d'un autre bloc parce qu'on en connaît le chemin.");
}

if (unusedExceptions.size > 0) {
  failed = true;
  console.error("\n❌ Exceptions devenues inutiles — la liste doit se vider, pas mentir :\n");
  for (const key of unusedExceptions) {
    console.error(`   ${key}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  KNOWN.size === 0
    ? "✅ Frontières de contexte tenues, sans aucune exception."
    : `✅ Frontières de contexte tenues (${String(KNOWN.size)} exception(s) connue(s) à résorber).`,
);

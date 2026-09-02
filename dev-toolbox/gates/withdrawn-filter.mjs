#!/usr/bin/env node
/**
 * Gate : **aucune lecture de `catalog_items` n'oublie le retrait.**
 *
 * Depuis que le retrait marque au lieu de supprimer, une lecture sans
 * `withdrawnAt: null` **remet un article retiré en vente**. C'est une régression
 * introduite par une amélioration, sur une surface en service : le geste qui la
 * crée est motivé par la sécurité des données, et son effet de bord se voit à la
 * caisse, pas au déploiement.
 *
 * ## Pourquoi une porte, et pas une extension du client
 *
 * Le plan proposait un `$extends` qui injecterait la condition partout. Deux
 * faits l'ont écartée, tous deux invisibles avant d'ouvrir le code :
 *
 * 1. Elle ne tient dans une transaction que si elle est posée SOUS le routage
 *    transactionnel — donc sur le client global, donc dans `platform/`, qui ne
 *    connaît aucun contexte. Un socle qui sait qu'une table `catalog_items`
 *    existe n'est plus un socle, et ce franchissement-là ne passe ni par un
 *    import ni par une jointure : aucune autre porte ne le verrait.
 * 2. `accept-delivery` lit le miroir DANS une transaction. Un filtre qui s'y
 *    évapore ferait revenir un article retiré comme « déjà connu », donc
 *    rafraîchi au lieu d'être remis en vente. Silencieusement.
 *
 * Ce qui reste : la condition est nommée (`STILL_SOLD`), et cette porte refuse
 * qu'une lecture naisse sans elle — ou ailleurs que dans les trois adaptateurs
 * qui la portent.
 *
 * ## Ce que le gate NE dit pas
 *
 * Les ÉCRITURES ne sont pas filtrées, et c'est voulu : un `upsert` qui ne verrait
 * pas la ligne retirée tenterait une création, et la clé primaire refuserait —
 * un article qui revient au catalogue ferait tomber le push.
 *
 * Usage : `pnpm lint:withdrawn-filter`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN = join("apps", "lfd-api", "src");

/** Le client généré : il DÉCLARE les opérations, il n'en appelle aucune. */
const IGNORED = join(ROOT, SCAN, "platform", "database", "client");

/** Les seuls fichiers qui ont le droit de lire les articles du catalogue. */
const ALLOWED = new Set([
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-catalog.reader.ts",
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-catalog-admin.reader.ts",
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-catalog-item.repository.ts",
]);

/** Les opérations qui LISENT. Les autres écrivent, et doivent voir toute la table. */
const READS = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
];

const CALL = new RegExp(`\\.catalogItem\\.(${READS.join("|")})\\s*\\(`, "g");

/** L'argument de l'appel, borné par ses parenthèses — pas par un compte de lignes. */
function callArguments(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex, index + 1);
      }
    }
  }
  return source.slice(openIndex);
}

function* files(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (!path.startsWith(IGNORED)) {
        yield* files(path);
      }
      continue;
    }
    if (path.endsWith(".ts")) {
      yield path;
    }
  }
}

/** L'échappatoire, écrite sur l'appel : `// withdrawn-filter: exempt — <raison>`. */
const EXEMPT = /\/\/\s*withdrawn-filter:\s*exempt\b/;

const strangers = [];
const unfiltered = [];
const exempted = [];
let checked = 0;

for (const path of files(join(ROOT, SCAN)).map((path) => relative(ROOT, path))) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(CALL)) {
    const line = source.slice(0, match.index).split("\n").length;
    if (!ALLOWED.has(path)) {
      strangers.push(`${path}:${line}  (${match[1]})`);
      continue;
    }
    // L'exemption se lit sur les lignes qui PRÉCÈDENT l'appel : elle porte une
    // raison, et une raison se met au-dessus du geste qu'elle justifie.
    const preceding = source.slice(0, match.index).split("\n").slice(-4).join("\n");
    if (EXEMPT.test(preceding)) {
      exempted.push(`${path}:${line}  (${match[1]})`);
      continue;
    }
    checked += 1;
    const args = callArguments(source, match.index + match[0].length - 1);
    if (!args.includes("STILL_SOLD")) {
      unfiltered.push(`${path}:${line}  (${match[1]})`);
    }
  }
}

if (strangers.length > 0 || unfiltered.length > 0) {
  if (strangers.length > 0) {
    console.error(
      "\n✖ withdrawn-filter : des articles du catalogue sont lus hors des adaptateurs qui portent le filtre.\n",
    );
    for (const stranger of strangers) {
      console.error(`    ${stranger}`);
    }
    console.error(
      "\n  Une lecture qui oublie `STILL_SOLD` remet un article RETIRÉ en vente.",
      "\n  Passer par un port du catalogue, ou entrer dans l'allowlist du gate en",
      "\n  ayant écrit le filtre.\n",
    );
  }
  if (unfiltered.length > 0) {
    console.error("\n✖ withdrawn-filter : ces lectures ne portent pas `STILL_SOLD`.\n");
    for (const read of unfiltered) {
      console.error(`    ${read}`);
    }
    console.error("");
  }
  process.exit(1);
}

console.log(
  `✓ withdrawn-filter : les ${checked} lectures d'articles portent toutes le filtre du retrait.`,
);
// Comptées et NOMMÉES, jamais tues : une exception qu'on relit à chaque
// exécution ne dérive pas, une exception tacite si.
if (exempted.length > 0) {
  console.log(`  Échappatoires déclarées : ${exempted.length}`);
  for (const escape of exempted) {
    console.log(`    ${escape}`);
  }
}

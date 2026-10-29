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
  // Le froid relayé à la livraison (lot 4 bis, 2026-09-29) : il PORTE le
  // filtre (`...STILL_SOLD`) — un article retiré n'a plus à être chargé froid.
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-catalog-cold.reader.ts",
  // Les prix au kilo du rayon (`plan-prix-au-kilo.md`, K3, 2026-10-28) : il
  // PORTE le filtre (`...STILL_SOLD`) — un article retiré n'est pas au rayon.
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-catalog-price-per-kg.reader.ts",
  // Le rangement des SKU de commande (plan des exclusions de la remise de
  // retrait, V4, 2026-10-22) : il PORTE le filtre (`...STILL_SOLD`) — la
  // caisse ne range que ce qu'elle vend, un article retiré n'a pas de ligne.
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-order-line-classification.reader.ts",
  // La descente des limites de commande (lot 2b du catalogue synchronisé,
  // 2026-10-15) : elle PORTE le filtre — un article retiré reçoit ses limites
  // quand le fait de sa fiche le remet en vente.
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-catalog-order-limits.ts",
  // La vue « Catalogue publié » (lot 3 du catalogue synchronisé, 2026-10-15) :
  // elle PORTE le filtre — une déclinaison retirée n'y paraît que par les
  // manques que le fait de sa fiche déclare, jamais comme article en vente.
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-published-catalog.reader.ts",
  // Le retraçage du prix (lot D du catalogue synchronisé, 2026-10-15) : il
  // PORTE le filtre (`...STILL_SOLD`) — un article retiré ne se vend plus, sa
  // trace n'a pas à suivre le référentiel.
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-catalog-price-retracer.ts",
  // La sélection d'une opération au commerce (lot 1 de
  // `plan-l-operation-passe-au-commerce.md`, 2026-10-15) : elle demande si un
  // SKU EXISTE, pas s'il se vend — exemptée sur l'appel, avec sa raison.
  "apps/lfd-api/src/b2b/operations/infrastructure/prisma-operation-sku.catalogue.ts",
  // Les articles RETIRÉS, que la tarification nomme dans son refus (L5 de
  // `plan-pro-voit-les-declinaisons.md`, 2026-10-29) : exemptée sur l'appel —
  // elle cherche précisément ce que le filtre écarte.
  "apps/lfd-api/src/b2b/catalog/infrastructure/prisma-withdrawn-shop-skus.reader.ts",
  // Le semis de développement, et il PORTE le filtre : sa lecture demande
  // `withdrawnAt: null` explicitement (`ensureSkusExist`). Elle ne sert pas à
  // vendre — elle vérifie AVANT d'écrire que les SKU du corpus existent, pour
  // qu'un semis qui va échouer échoue avant d'avoir posé trois commandes.
  // La faire passer par un port du catalogue lui ferait traverser le bus pour
  // une question qu'elle pose à la base d'à côté.
  "apps/lfd-api/src/dev/seeding/orders.seed.ts",
  // La mise en avant semée (2026-10-19) : elle PORTE le filtre
  // (`...STILL_SOLD`) — elle résout la déclinaison par défaut des SKU du corpus
  // pour la commande de l'écran, et un article retiré ne se met pas en avant.
  "apps/lfd-api/src/dev/seeding/featured.seed.ts",
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

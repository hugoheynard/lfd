#!/usr/bin/env node
/**
 * Gate : **il n'y a qu'un seul chemin pour fabriquer un prix**, et ses entrées
 * sont nommées.
 *
 * `resolvePrice` est la fonction qui facture. Tout ce qui affiche ou encaisse un
 * prix doit en sortir — sans quoi deux réponses coexistent pour la même
 * question, et c'est celle qui n'est pas la facture que le client conteste.
 *
 * ## Ce que cette porte tient, et ce que le compilateur tient déjà
 *
 * Le **type** `PriceInputs` rend l'oubli d'un étage inexprimable : `ladders` et
 * `mercuriale` sont obligatoires, donc un appelant ne peut plus omettre, il ne
 * peut que **déclarer** `[]` ou `null` — et une déclaration se lit en
 * relecture. Ça, c'est acquis, et ça ne se perdra pas.
 *
 * Ce que le compilateur ne dit pas, c'est **combien** de portes d'entrée ce
 * pipeline a. Rien n'empêche d'en ouvrir une sixième, et c'est exactement
 * comme ça que les divergences sont nées : le tableau de tarification et la
 * projection appelaient `resolvePrice` chacun de leur côté, et chacun a oublié
 * un étage différent — 1,83924 € contre 1,65532 € sur le premier, une courbe au
 * tarif catalogue sur le second (tous deux corrigés le 2026-09-08).
 *
 * D'où l'inventaire ci-dessous — **une seule ligne depuis le 2026-09-09**. Les
 * cinq portes ont été refermées le jour où les six gestes qu'un prix demande
 * sont passés dans un objet nommé : un appelant demande désormais un prix, il
 * n'en compose plus un.
 *
 * ## Ce que cette porte NE tient pas
 *
 * Elle ne prouve pas qu'un écran n'a pas recalculé un prix dans son coin. Ce
 * risque-là est couvert ailleurs, et partiellement : `lint:money-units` attrape
 * les multiplications d'unités, et l'écart entre deux prix n'a plus qu'une
 * définition (`@lfd/money`). Le dire ici plutôt que de laisser croire que la
 * porte couvre tout.
 *
 * Usage : `pnpm lint:price-pipeline` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "client", "coverage", ".turbo"]);

/** L'appel, pas l'import : c'est l'usage qui ouvre une porte. */
const CALL = /\bresolvePrice\s*\(/u;

/**
 * **L'unique entrée du pipeline.**
 *
 * Il y en a eu cinq. Chacune chargeait ses matériaux, construisait son contexte,
 * décidait son plancher et appelait `resolvePrice` — cinq recettes pour une
 * seule question, et **deux se sont trompées** : le tableau de tarification
 * annonçait 1,83924 € quand la caisse facturait 1,65532 € (barèmes non passés),
 * et la projection rendait la courbe d'un client négocié au tarif catalogue
 * (mercuriale non lue). Aucune des deux ne rougissait : un prix auquel il manque
 * un étage reste un prix plausible.
 *
 * Depuis le 2026-09-09, ces gestes vivent dans **le tarificateur**, une fois.
 * Les cinq appelants lui demandent un prix au lieu d'en composer un — ils ne
 * construisent plus de contexte, ne décident plus de plancher, n'assemblent plus
 * d'étage. La liste ci-dessous ne peut donc plus décroître : elle est à un.
 *
 * Ouvrir une entrée de plus reste possible : ça demande d'écrire ici pourquoi le
 * tarificateur ne convenait pas. C'est le prix qu'on met à la question « et si
 * j'appelais directement ? ».
 */
const ENTRIES = [
  // LE tarificateur. Il porte les six gestes qu'un prix demande — contexte,
  // engagement, mesure retenue, plancher, porte dynamique, assemblage — et il
  // est pur : ses matériaux lui sont donnés, il ne lit rien.
  //
  // Les questions qui ne sont pas « le prix de cet article » sont des MÉTHODES
  // de cet objet, pas des entrées de plus : `tiers` pour la grille des paliers,
  // `priceAtCumulative` pour la projection, `mercurialeAlone` pour le
  // comparatif de marché — chacune avec sa raison, écrite au-dessus d'elle.
  "src/b2b/pricing/domain/loaded-pricer.ts",
];

function isEntry(relPath) {
  const unix = relPath.split("\\").join("/");
  return ENTRIES.some((suffix) => unix.endsWith(suffix));
}

/** Commentaires retirés : une porte qui lit la prose ne garde rien. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    if (!entry.name.endsWith(".ts")) {
      return [];
    }
    // Les tests appellent la fonction pure directement, et c'est leur travail :
    // c'est même la seule façon d'énumérer ses cas sans fabriquer un panier.
    return path.includes("__tests__") ? [] : [path];
  });
}

const root = join(ROOT, SCAN_ROOT);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`✗ price-pipeline : ${SCAN_ROOT} introuvable.`);
  process.exit(1);
}

const undeclared = [];
const seen = new Set();
for (const file of sourceFiles(root)) {
  const rel = relative(ROOT, file);
  const source = withoutComments(readFileSync(file, "utf8"));
  // La définition elle-même n'est pas une entrée.
  if (rel.endsWith("src/b2b/pricing/domain/resolve-price.ts")) {
    continue;
  }
  if (!CALL.test(source)) {
    continue;
  }
  if (isEntry(rel)) {
    seen.add(rel.split("\\").join("/"));
    continue;
  }
  undeclared.push(rel);
}

const missing = ENTRIES.filter((suffix) => ![...seen].some((rel) => rel.endsWith(suffix)));

if (undeclared.length > 0 || missing.length > 0) {
  console.error("\n✗ price-pipeline\n");
  for (const rel of undeclared) {
    console.error(`  ${rel} — entrée NON DÉCLARÉE dans le pipeline de prix`);
  }
  for (const suffix of missing) {
    console.error(`  ${suffix} — entrée déclarée qui n'appelle plus : la retirer de la liste`);
  }
  console.error(
    "\n  Une entrée de plus, c'est une réponse de plus à « combien coûte cet\n" +
      "  article ». Les deux divergences connues sont nées comme ça. La question\n" +
      "  à se poser : le tarificateur ne peut-il vraiment pas répondre ? Si c'est\n" +
      "  une VARIANTE de la question, c'est une méthode de plus sur `LoadedPricer`,\n" +
      "  pas un appel de plus à `resolvePrice`.\n",
  );
  process.exit(1);
}

console.log(`✓ price-pipeline : ${String(ENTRIES.length)} entrée déclarée, aucune de plus.`);

#!/usr/bin/env node
/**
 * Gate : **on demande un prix par LA porte**, pas par ses rouages.
 *
 * `Pricer.load(...)` rend un `PricedLot` qui connaît ses articles. Derrière lui,
 * deux objets font le travail :
 *
 * - `PricingMaterialsLoader` — la seule séquence de chargement du dépôt ;
 * - `LoadedPricer` — le tarificateur pur, seul appelant de `resolvePrice`.
 *
 * Ils sont **internes**. Un appelant qui les atteint ne contourne pas une
 * convention : il réécrit la chorégraphie du prix, et c'est exactement ce qui a
 * produit les deux divergences connues — l'écran de tarification annonçait
 * 1,83924 € quand la caisse facturait 1,65532 €, la projection servait une
 * courbe au tarif catalogue à un client qui avait une mercuriale.
 *
 * ## Pourquoi une porte, et pas une convention
 *
 * La convention existait, écrite dans le JSDoc de la façade — et elle
 * **autorisait** le contournement : « un appelant qui charge déjà en lot
 * s'adresse au `LoadedPricer` directement ». La vitrine l'a exercé, et elle
 * avait raison : la façade relisait un catalogue qu'elle avait déjà.
 *
 * La façade ne relit plus rien depuis le 2026-09-09 : elle prend des articles.
 * Le motif du contournement a disparu, donc l'autorisation aussi — et cette
 * porte est ce qui rend le prochain contournement **visible en relecture**,
 * puisqu'il demanderait de modifier un fichier de CI.
 *
 * ## Ce qu'elle regarde
 *
 * Les `import` seulement, jamais la prose : un JSDoc qui NOMME `LoadedPricer`
 * pour expliquer où il vit est une bonne chose, et le compter ferait de cette
 * porte un bruit qu'on apprend à ignorer.
 *
 * ## Ce qu'elle laisse aux suites
 *
 * Une spec qui **assemble** le vrai graphe — `new Pricer(new
 * PricingMaterialsLoader(…), clock)` — construit la production plutôt qu'elle ne
 * la contourne. C'est ce qu'on lui demande : éprouver l'objet réel, pas un
 * doublé qui dériverait. La règle vise le **code servi**.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const API = join(ROOT, "apps", "lfd-api");

/** Le contexte qui a le droit de connaître ses propres rouages. */
const INSIDE = join("src", "b2b", "pricing") + sep;

/** Les deux rouages, tels qu'un import les nomme. */
const INTERNALS =
  /import[^;]*?\b(LoadedPricer|PricingMaterialsLoader)\b[^;]*?from\s*["'][^"']+["']/gs;

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

/** Une suite assemble le vrai graphe : elle construit la production. */
function isSpec(path) {
  return path.startsWith("test" + sep) || path.includes(sep + "__tests__" + sep);
}

const failures = [];
let inSpecs = 0;

for (const root of ["src", "test"]) {
  for (const file of sources(join(API, root))) {
    const path = relative(API, file);
    if (path.startsWith(INSIDE)) {
      continue;
    }
    INTERNALS.lastIndex = 0;
    const hits = (readFileSync(file, "utf8").match(INTERNALS) ?? []).length;
    if (hits === 0) {
      continue;
    }
    if (isSpec(path)) {
      inSpecs += hits;
    } else {
      failures.push([relative(ROOT, file), hits]);
    }
  }
}

if (failures.length > 0) {
  console.error("\n✗ price-door\n");
  for (const [file, hits] of failures) {
    console.error(`  ${file}  importe un rouage du prix (${String(hits)}×)`);
  }
  console.error(
    "\n  Un prix se demande par `Pricer.load({ articles, companyId })`, qui rend un\n" +
      "  `PricedLot`. Atteindre le chargeur ou le tarificateur, c'est réécrire la\n" +
      "  chorégraphie — et c'est ainsi que deux écrans ont annoncé un prix que la\n" +
      "  caisse ne facturait pas.\n",
  );
  process.exit(1);
}

console.log(
  `✓ price-door : aucun code servi hors de b2b/pricing/ n'atteint le chargeur\n` +
    `  ni le tarificateur ; ${String(inSpecs)} assemblage(s) en suites, qui montent\n` +
    `  le vrai graphe plutôt que de le contourner.`,
);

#!/usr/bin/env node
/**
 * Gate : **plus de rayons écrits dans le code** — la famille est une donnée.
 *
 * Le 2026-09-26, un article rangé par le PIM dans une famille que la table en
 * dur ne connaissait pas a mis tout le catalogue pro en 500 : Tarification,
 * tarif d'un client, Limites de prix, saisie de commande. La table traduisait
 * une famille du référentiel (`cat_vien`) en un code de rayon (`viennoiserie`)
 * pris dans une union fermée. Elle a été retirée (plan
 * `documentation/pricing/plan-familles-en-donnees.md`) : le rayon EST la
 * famille, par son id, avec son nom et sa position lus dans le miroir.
 *
 * ## Ce qu'elle refuse
 *
 * 1. **Le retour des noms retirés**, partout où le serveur et les paquets
 *    partagés se compilent — `catalogCategorySchema`, `CatalogCategory`,
 *    `CATALOG_CATEGORY_LABELS`, `CATALOG_CATEGORY_ORDER`,
 *    `SHELF_BY_PIM_CATEGORY`, `shelfOfCategory`, `UnknownCatalogShelfError`.
 * 2. **Un littéral de rayon** — un ancien code (`"viennoiserie"`, `"pain"`,
 *    `"patisserie"`, `"sale"`, `"chocolat"`) ou une famille `cat_*` du semis
 *    d'autrefois — dans le code du commerce et du fournil, leurs suites
 *    comprises, et dans les e2e qui ne sont pas celles du référentiel. Une
 *    suite qui écrit `viennoiserie` éprouve la table qu'on a retirée.
 *
 * ## Ce qu'elle laisse
 *
 * - `legacy-shelf-codes.ts` : le seul lecteur des anciennes clés, que le
 *   journal tarifaire et les traces figées gardent (elles sont immuables) ;
 * - les suites qui éprouvent précisément CETTE lecture, ou la migration qui
 *   reprend les codes — nommées ci-dessous, chacune avec sa raison ;
 * - le référentiel (`src/pim/`, `test/pim-*`) : ses familles y sont ses
 *   propres données, et un id `patisserie` y est un id comme un autre ;
 * - les migrations SQL — une valeur de donnée n'est pas un nom.
 *
 * ⚠️ Elle lit des chaînes, pas des types : une famille construite à partir
 * d'une concaténation lui échappe. Elle ferme l'accident, pas la volonté.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Les noms retirés le 2026-09-26 : partout où du TypeScript du serveur ou des paquets vit. */
const RETIRED_NAMES = [
  "catalogCategorySchema",
  "CatalogCategory",
  "CATALOG_CATEGORY_LABELS",
  "CATALOG_CATEGORY_ORDER",
  "SHELF_BY_PIM_CATEGORY",
  "shelfOfCategory",
  "UnknownCatalogShelfError",
];
const RETIRED = new RegExp(`\\b(${RETIRED_NAMES.join("|")})\\b`, "g");

/** Un code de rayon ou une famille `cat_*`, entre guillemets. */
const SHELF_LITERAL =
  /["'`](viennoiserie|pain|patisserie|sale|chocolat|cat_(?:vien|pains?|patis|sale|choco))["'`]/g;

/** Où les noms retirés sont refusés. */
const NAME_ROOTS = ["apps/lfd-api/src", "apps/lfd-api/test", "packages"];

/** Où les littéraux de rayon sont refusés. */
const LITERAL_ROOTS = [
  "apps/lfd-api/src/b2b",
  "apps/lfd-api/src/production",
  "apps/lfd-api/test",
  "packages/contracts/src",
  "packages/b2b-ui/src",
];

/**
 * Les fichiers qui ont le droit d'écrire un ancien code, et pourquoi. La
 * liste ne grandit pas : une famille nouvelle est une donnée.
 */
const LITERAL_ALLOWED = new Map([
  [
    "apps/lfd-api/src/b2b/catalog/domain/legacy-shelf-codes.ts",
    "le seul lecteur des anciennes clés du journal et des traces figées",
  ],
  [
    "apps/lfd-api/src/b2b/pricing/application/__tests__/scope-names.spec.ts",
    "éprouve la lecture d'une portée passée en ancien code",
  ],
  [
    "apps/lfd-api/test/families-in-data-migration.e2e-spec.ts",
    "rejoue la migration qui reprend les anciens codes",
  ],
]);

/** Le référentiel a ses familles à lui : elles ne sont pas des rayons du commerce. */
function isReferential(path) {
  return path.startsWith("apps/lfd-api/test/pim-");
}

function* sources(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!["node_modules", "dist", "client", "migrations", ".turbo"].includes(entry)) {
        yield* sources(full);
      }
    } else if (entry.endsWith(".ts") || entry.endsWith(".mts")) {
      yield full;
    }
  }
}

const posix = (path) => path.split(sep).join("/");
const failures = [];
let allowed = 0;

for (const root of NAME_ROOTS) {
  for (const file of sources(join(ROOT, root))) {
    const path = posix(relative(ROOT, file));
    const hits = readFileSync(file, "utf8").match(RETIRED) ?? [];
    if (hits.length > 0) {
      failures.push(`${path}  nom retiré : ${[...new Set(hits)].join(", ")}`);
    }
  }
}

for (const root of LITERAL_ROOTS) {
  for (const file of sources(join(ROOT, root))) {
    const path = posix(relative(ROOT, file));
    if (isReferential(path)) {
      continue;
    }
    const hits = readFileSync(file, "utf8").match(SHELF_LITERAL) ?? [];
    if (hits.length === 0) {
      continue;
    }
    if (LITERAL_ALLOWED.has(path)) {
      allowed += hits.length;
      continue;
    }
    failures.push(`${path}  littéral de rayon : ${[...new Set(hits)].join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error("\n✗ no-shelf-literals\n");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  console.error(
    "\n  La famille d'un article est une DONNÉE du référentiel : son id, son nom et sa\n" +
      "  position se lisent dans `catalog_categories`. Une table de rayons dans le code a\n" +
      "  mis le catalogue pro en 500 le 2026-09-26. Viser la famille par son id ; lire un\n" +
      "  ancien code passe par `legacy-shelf-codes.ts`.\n",
  );
  process.exit(1);
}

console.log(
  `✓ no-shelf-literals : aucun rayon écrit dans le code ; ${String(allowed)} ancien(s) code(s)\n` +
    `  lu(s) dans ${String(LITERAL_ALLOWED.size)} fichier(s) admis, chacun pour sa raison.`,
);

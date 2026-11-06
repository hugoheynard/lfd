#!/usr/bin/env node
/**
 * Gate : **le catalogue servi se lit par l'instantané**, pas en direct
 * (`documentation/caching-usage/plan-materiaux-du-catalogue.md`, § 3, lot M2 ;
 * modèle : `lint:price-door`).
 *
 * Le devis, l'estimation de la saisie et le recalcul du rayon lisent le
 * catalogue dans l'instantané (`withCatalogueSnapshot`), à chaud en une
 * lecture des numéros. Un lecteur neuf qui interrogerait `catalog_items` en
 * direct sur l'un de ces chemins rendrait cinq lectures là où il en faut une
 * — et surtout lirait un état que les numéros ne gardent pas d'accord avec le
 * reste de la requête. Une porte ne suit pas un chemin d'exécution ; elle
 * tient donc l'INVENTAIRE : tout fichier servi qui lit une table de
 * l'instantané est classé ici, date et raison écrites, et un lecteur neuf
 * échoue tant que quelqu'un n'a pas décidé où il va.
 *
 * Trois sortes d'entrées :
 *
 * - **le chargeur** — l'instantané lui-même ;
 * - **les replis** ({@link FALLBACKS}) — l'adaptateur en base qu'un
 *   adaptateur `Snapshot*` remplace dans la portée et appelle hors d'elle.
 *   La porte vérifie qu'un fichier de `catalogue-snapshot/` (ou un
 *   `snapshot-*.ts`) l'importe bien : un repli que plus rien n'enveloppe
 *   serait lu en direct sur le chemin ;
 * - **hors des chemins** ({@link ADMITTED}) — administration, écritures,
 *   passation (qui relit la base pour ce qu'elle écrit, § 2.5), semis.
 *
 * Une entrée dont le fichier ne lit plus rien échoue aussi : une liste admise
 * qui ne décroît pas en silence reste vraie.
 *
 * Ce qu'elle ne voit pas, et c'est dit : une lecture IMBRIQUÉE (une table de
 * l'instantané en `include` d'un autre modèle), et un accès au client par
 * une clé calculée. Commentaires retirés.
 * Usage : `pnpm lint:catalogue-door` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", "__tests__", "client"]);
const SRC = "apps/lfd-api/src/";

/** Les modèles de l'instantané (`catalogue-snapshot-columns.ts`), et leurs tables. */
export const SNAPSHOT_MODELS = {
  catalogItem: "catalog_items",
  catalogCategory: "catalog_categories",
  catalogItemOverride: "catalog_item_overrides",
  catalogItemReservation: "catalog_item_reservations",
  catalogOperation: "catalog_operations",
  catalogOperationItem: "catalog_operation_items",
  orderCutoff: "order_cutoffs",
  orderCutoffSettings: "order_cutoff_settings",
};

/** Le chargeur de l'instantané. */
export const LOADER = "b2b/catalog/infrastructure/catalogue-snapshot/catalogue-snapshot.loader.ts";

/** Les replis : lus hors de la portée, remplacés dans la portée (relevé le 2026-11-06). */
export const FALLBACKS = {
  "b2b/catalog/infrastructure/prisma-catalog.reader.ts":
    "lectures A, B, D et la lignée — `SnapshotCatalogReader`, `SnapshotCatalogOperationsReader`",
  "b2b/catalog/infrastructure/prisma-catalog-operations.reader.ts":
    "les opérations en vente — `SnapshotCatalogOperationsReader` (M2)",
  "b2b/catalog/infrastructure/prisma-catalog-price-per-kg.reader.ts":
    "lecture E — `SnapshotCatalogPricePerKgReader` (M2)",
  "b2b/catalog/infrastructure/prisma-default-sale-reference.reader.ts":
    "le défaut des tuiles de la vitrine — `SnapshotDefaultSaleReferenceReader` (M2)",
  "b2b/catalog/infrastructure/prisma-order-line-classification.reader.ts":
    "lecture C — `SnapshotOrderLineClassificationReader`",
  "b2b/order-cutoffs/infrastructure/prisma-stored-order-cutoff.reader.ts":
    "l'heure limite générale — `SnapshotStoredOrderCutoffReader`",
};

/** Hors des chemins de l'instantané — chacun avec sa raison (relevé le 2026-11-06). */
export const ADMITTED = {
  "b2b/catalog/infrastructure/prisma-catalog-admin.reader.ts":
    "administration : le catalogue du personnel, retirés et en revue compris",
  "b2b/catalog/infrastructure/prisma-made-to-order-admin.reader.ts":
    "administration : l'écran du sur mesure",
  "b2b/catalog/infrastructure/prisma-published-catalog.reader.ts":
    "administration : le catalogue publié (`admin-catalog.controller.ts`)",
  "b2b/catalog/infrastructure/prisma-received-operations.reader.ts":
    "administration : l'éditeur de vitrine voit tout le miroir des opérations",
  "b2b/catalog/infrastructure/prisma-withdrawn-shop-skus.reader.ts":
    "administration : les décisions tarifaires nomment un article RETIRÉ, absent de l'instantané (§ 2.4)",
  "b2b/catalog/infrastructure/prisma-detachment-origin.reader.ts":
    "administration : le report d'un prix négocié vérifie la filiation",
  "b2b/catalog/infrastructure/prisma-sale-reference-lineage.reader.ts":
    "passation et alertes : la filiation (F), relue pour ce qu'on écrit (§ 2.5)",
  "b2b/catalog/infrastructure/prisma-sale-reference-succession.reader.ts":
    "rapports par article : la lignée de détachement",
  "b2b/catalog/infrastructure/prisma-catalog-cold.reader.ts":
    "livraison : le froid des produits, relayé à la tournée",
  "b2b/catalog/infrastructure/prisma-catalog-item.repository.ts":
    "écriture : charge l'agrégat qu'elle enregistre",
  "b2b/catalog/infrastructure/prisma-catalog-order-limits.ts":
    "écriture : la descente des limites de commande",
  "b2b/catalog/infrastructure/prisma-catalog-price-retracer.ts": "écriture : la trace des prix",
  "b2b/operations/infrastructure/prisma-operation.repository.ts":
    "écriture : charge l'opération qu'elle enregistre",
  "b2b/operations/infrastructure/prisma-operation.reader.ts":
    "administration : les écrans des opérations",
  "b2b/operations/infrastructure/prisma-operation-sku.catalogue.ts":
    "administration : les articles qu'une opération peut sélectionner",
  "b2b/operations/infrastructure/prisma-operation-media-usage.ts":
    "médiathèque : qui affiche cette image",
  "b2b/order-cutoffs/infrastructure/prisma-general-order-cutoff.repository.ts":
    "écriture : charge la règle générale qu'elle enregistre",
  "b2b/order-cutoffs/infrastructure/prisma-order-cutoff-settings.reader.ts":
    "⚠️ lu SUR le chemin du devis (jour même), décidé au § 12 : son port rend aussi la garde en rayon, à resserrer avant de le servir depuis l'instantané",
  "dev/": "semis de démonstration, hors requête",
};

/** Les commentaires racontent les lectures pour les expliquer : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const MODEL_READ = new RegExp(
  `\\b(${Object.keys(SNAPSHOT_MODELS).join("|")})\\s*\\.\\s*` +
    "(?:findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy)\\s*\\(",
  "g",
);
const SQL_READ = new RegExp(
  `\\b(?:FROM|JOIN)\\s+(?:"?public"?\\.)?"?(${Object.values(SNAPSHOT_MODELS).join("|")})\\b`,
  "gi",
);

/** Les tables de l'instantané qu'une source lit en direct. */
export function snapshotReadsOf(source) {
  const code = withoutComments(source);
  const tables = new Set();
  for (const m of code.matchAll(MODEL_READ)) {
    tables.add(SNAPSHOT_MODELS[m[1]]);
  }
  for (const m of code.matchAll(SQL_READ)) {
    tables.add(m[1].toLowerCase());
  }
  return [...tables].sort();
}

const isAdmitted = (path, admitted) =>
  Object.keys(admitted).some((key) => (key.endsWith("/") ? path.startsWith(key) : path === key));

/** Un fichier de l'instantané : son dossier, ou un adaptateur `snapshot-*.ts`. */
const isSnapshotSide = (path) =>
  path.includes("/catalogue-snapshot/") || basename(path).startsWith("snapshot-");

/** Le repli est-il importé par un fichier de l'instantané ? */
function isWrapped(fallback, files) {
  const name = basename(fallback).replace(/\.ts$/u, ".js");
  return files.some(
    ({ path, source }) =>
      isSnapshotSide(path) && new RegExp(`from\\s*["'][^"']*/${name}["']`).test(source),
  );
}

/**
 * Le verdict sur des fichiers `{ path, source }` (chemins relatifs à
 * `apps/lfd-api/src/`). Les listes sont en paramètre pour les tests.
 */
export function verdict(
  files,
  { fallbacks = FALLBACKS, admitted = ADMITTED, loader = LOADER } = {},
) {
  const failures = [];
  const readers = new Set();
  for (const { path, source } of files) {
    const tables = snapshotReadsOf(source);
    if (tables.length === 0) {
      continue;
    }
    readers.add(path);
    if (path === loader || path in fallbacks || isAdmitted(path, admitted)) {
      continue;
    }
    failures.push(
      `${path}  lit ${tables.join(", ")} en direct — passer par l'instantané, ou classer le fichier`,
    );
  }
  for (const fallback of Object.keys(fallbacks)) {
    if (!readers.has(fallback)) {
      failures.push(`${fallback}  inscrit en repli, mais ne lit plus rien : le retirer`);
    } else if (!isWrapped(fallback, files)) {
      failures.push(
        `${fallback}  inscrit en repli, mais aucun adaptateur de l'instantané ne l'enveloppe`,
      );
    }
  }
  for (const entry of Object.keys(admitted)) {
    if (!entry.endsWith("/") && !readers.has(entry)) {
      failures.push(`${entry}  admis, mais ne lit plus rien : le retirer`);
    }
  }
  if (!readers.has(loader)) {
    failures.push(
      `${loader}  le chargeur ne lit plus rien : la porte ne sait plus ce qu'elle garde`,
    );
  }
  return { failures, readers: readers.size };
}

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* sources(join(dir, entry.name));
      }
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")) {
      yield join(dir, entry.name);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const files = [...sources(join(root, SCAN_ROOT))].map((full) => ({
    path: relative(join(root, SRC), full),
    source: readFileSync(full, "utf8"),
  }));
  const { failures, readers } = verdict(files);
  if (failures.length > 0) {
    console.error("\n✗ catalogue-door\n");
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    console.error(
      "\n  Le devis, l'estimation et le rayon lisent le catalogue dans l'instantané\n" +
        "  (`withCatalogueSnapshot`). Un lecteur neuf de ces tables est un adaptateur\n" +
        "  `Snapshot*` (avec son repli inscrit ici), ou un chemin hors de l'instantané\n" +
        "  inscrit avec sa raison.\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ catalogue-door : ${String(readers)} fichier(s) lisent les tables de l'instantané,\n` +
      `  tous classés — le chargeur, ${String(Object.keys(FALLBACKS).length)} repli(s) enveloppé(s), ` +
      "le reste hors des chemins.",
  );
}

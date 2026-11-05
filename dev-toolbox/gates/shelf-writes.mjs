#!/usr/bin/env node
/**
 * Gate : **qui écrit ce que le rayon lit émet le signal de purge**
 * (`documentation/caching-usage/le-rayon-en-cache.md`, § 7 et C1).
 *
 * Le cache des rayons (C2, C3) ne sait qu'un rayon est périmé que si celui
 * qui écrit le lui dit : c'est le modèle d'un Redis, « celui qui écrit
 * efface ». Un écrivain qui l'oublie laisse un rayon faux en cache jusqu'à la
 * fin de sa durée de vie, sans qu'aucun test ne rougisse. La porte est donc
 * bâtie AVANT le premier cache.
 *
 * Tout fichier de `apps/lfd-api/src` (hors tests et client généré) qui écrit
 * un modèle de {@link SHELF_MODELS} — par le client Prisma
 * (`.model.create|update|upsert|delete` et leurs formes `Many`) ou en SQL brut
 * qui nomme sa table (`INSERT INTO`, `UPDATE`, `DELETE FROM`, `TRUNCATE`) —
 * référence `ShelfChanges`, ou figure dans {@link ADMITTED} avec sa date et
 * sa raison.
 *
 * Chaque modèle de la liste doit exister dans le schéma, et sa table se lit
 * dans son `@@map` : un modèle renommé ne désarme pas la porte en silence.
 *
 * Ce qu'elle ne voit pas, et c'est dit : une écriture IMBRIQUÉE (une relation
 * écrite depuis un autre modèle, `company: { update: … }`), et un accès au
 * client par une clé calculée (`prisma[model]`). Aucun des deux n'existe sur
 * ces modèles le 2026-11-04.
 *
 * Commentaires retirés : une phrase qui raconte une écriture n'en est pas une.
 * Usage : `pnpm lint:shelf-writes` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { prismaSchemaSource } from "./lib/prisma-schema.mjs";

const ROOT = process.cwd();
const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", "__tests__", "client"]);

/**
 * Les modèles que le rayon lit — relevés le 2026-11-04 dans les lecteurs de
 * `ShopCataloguePricing` (catalogue, opérations, heures limites, prix au kilo,
 * offres d'acheminement, `CatalogViewers`, `Pricer` et son chargeur).
 *
 * `CatalogOperationOverride` et `PromotionSetting` ne sont lus par AUCUN
 * lecteur du rayon (vérifié le 2026-11-04 : la première est « sans lecteur »
 * depuis X2, la seconde n'est lue que par l'écran des promotions) ; ils
 * restent ici parce que le plan les a listés et qu'aucun fichier ne les écrit.
 *
 * ⚠️ `OrderLine` est lue aussi (volumes d'un engagement, ratio d'un plancher
 * dynamique) et n'est PAS ici : la question est remontée au plan.
 */
export const SHELF_MODELS = [
  "CatalogItem",
  "CatalogItemOverride",
  "CatalogCategory",
  "CatalogPriceHistory",
  "CatalogItemReservation",
  "CatalogOperation",
  "CatalogOperationItem",
  "CatalogOperationOverride",
  "OrderCutoff",
  "OrderCutoffSettings",
  "Company",
  "CompanyFollow",
  "VolumeCommitment",
  "CompanyMercuriale",
  "CompanyMercurialeAmendment",
  "PriceRule",
  "PriceFloor",
  "VolumeLadder",
  "Promotion",
  "PromotionScopeRule",
  "PromotionAudienceTarget",
  "PromotionPickupPoint",
  "PromotionDeliveryZone",
  "PromotionSetting",
  // Les offres d'acheminement du rayon (`ShopCatalogueOffers`).
  "Site",
  "DeliveryAvailability",
];

/**
 * Les fichiers qui écrivent un modèle du rayon SANS émettre le signal, et
 * pourquoi. Une entrée sans date ni raison n'en est pas une.
 */
const ADMITTED = [
  {
    // 2026-11-04 — le semis de démonstration vide la base locale ; aucun cache
    // n'y survit à un redémarrage, et il n'existe pas en production.
    file: "src/dev/seeding/reset.seed.ts",
    since: "2026-11-04",
  },
  // 2026-11-04 — trois fonctions d'écriture du catalogue qui reçoivent le
  // client d'une transaction ouverte par leur appelant. Elles ne peuvent pas
  // émettre : dans un `$transaction` direct il n'y a pas d'unité ambiante, et
  // le signal partirait avant la validation. Leurs appelants émettent APRÈS :
  // `prisma-catalog-item.repository.ts` (les trois) et
  // `prisma-catalog-product-facts.projection.ts` (`upsertCatalogItems`).
  // Un appelant de plus se vérifie à la main ; la porte ne le voit pas.
  { file: "src/b2b/catalog/infrastructure/catalog-item-upsert.ts", since: "2026-11-04" },
  { file: "src/b2b/catalog/infrastructure/catalog-decision-writes.ts", since: "2026-11-04" },
  { file: "src/b2b/catalog/infrastructure/catalog-review-states.ts", since: "2026-11-04" },
];

const WRITE_METHODS = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
];

/** Retire commentaires de bloc et de ligne, sans toucher le contenu d'une chaîne. */
export function withoutComments(source) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (quote !== null) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) {
        quote = null;
      }
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** `CatalogItem` → `catalogItem`, l'accesseur du client Prisma. */
const accessorOf = (model) => model[0].toLowerCase() + model.slice(1);

/** La table de chaque modèle, lue dans son `@@map` ; `null` si le modèle n'existe pas. */
export function tablesOf(schema, models) {
  const tables = new Map();
  for (const model of models) {
    const block = schema.match(new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "mu"));
    if (block === null) {
      tables.set(model, null);
      continue;
    }
    tables.set(model, block[1].match(/@@map\("([^"]+)"\)/u)?.[1] ?? model);
  }
  return tables;
}

/** Les détecteurs d'écriture, un client Prisma et un SQL par modèle. */
export function writeDetectors(tables) {
  return [...tables].map(([model, table]) => ({
    model,
    prisma: new RegExp(
      `\\.${accessorOf(model)}\\s*\\.\\s*(?:${WRITE_METHODS.join("|")})\\s*\\(`,
      "u",
    ),
    sql: new RegExp(
      `\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?)\\s+(?:"?public"?\\.)?"?${table}"?(?![\\w])`,
      "u",
    ),
  }));
}

/** Les modèles du rayon qu'un source écrit. */
export function shelfWritesOf(source, detectors) {
  const code = withoutComments(source);
  return detectors
    .filter(({ prisma, sql }) => prisma.test(code) || sql.test(code))
    .map(({ model }) => model);
}

/** Vrai si le source emploie le port (un commentaire ne compte pas). */
export function emitsShelfChanges(source) {
  return /\bShelfChanges\b/u.test(withoutComments(source));
}

/** Le détecteur, éprouvé à chaque exécution : un motif cassé ne refuserait plus rien. */
function selfCheck() {
  const detectors = writeDetectors(
    new Map([
      ["CatalogItem", "catalog_items"],
      ["Company", "companies"],
      ["Promotion", "promotions"],
    ]),
  );
  const cases = [
    ["écriture Prisma", "await tx.catalogItem.updateMany({})", 1],
    ["écriture sur deux lignes", "this.prisma.company\n  .update({})", 1],
    ["lecture", "await prisma.catalogItem.findMany({})", 0],
    ["modèle voisin", "await prisma.catalogItemReservation.createMany({})", 0],
    ["préfixe voisin", "await prisma.promotionScopeRule.deleteMany({})", 0],
    ["SQL brut", "await tx.$executeRaw`UPDATE public.catalog_items SET x = 1`", 1],
    ["SQL guillemeté", 'INSERT INTO "public"."companies" (id)', 1],
    ["SQL table voisine", "INSERT INTO public.catalog_items_archive (id)", 0],
    ["SQL lecture", "SELECT * FROM public.companies", 0],
    ["commentaire", "// await prisma.company.update({})", 0],
    ["bloc", "/* UPDATE companies SET */", 0],
    ["deux modèles", "x.company.create(); y.promotion.upsert()", 2],
  ];
  const failures = cases
    .filter(([, source, expected]) => shelfWritesOf(source, detectors).length !== expected)
    .map(([name]) => `détecteur cassé sur le cas « ${name} »`);
  if (!emitsShelfChanges("constructor(private readonly shelves: ShelfChanges)")) {
    failures.push("détecteur cassé sur le cas « port injecté »");
  }
  if (emitsShelfChanges("// ShelfChanges plus tard")) {
    failures.push("détecteur cassé sur le cas « port en commentaire »");
  }
  return failures;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

const unix = (path) => path.split("\\").join("/");

function main() {
  const failures = selfCheck();
  const tables = tablesOf(prismaSchemaSource(ROOT), SHELF_MODELS);
  for (const [model, table] of tables) {
    if (table === null) {
      failures.push(
        `le modèle « ${model} » n'existe plus dans le schéma : corrigez SHELF_MODELS ` +
          `(renommé ? sa nouvelle forme doit y entrer, sinon ses écrivains échappent à la porte).`,
      );
    }
  }
  const detectors = writeDetectors(new Map([...tables].filter(([, table]) => table !== null)));
  const admitted = new Set(ADMITTED.map(({ file }) => file));
  const seenAdmitted = new Set();
  let writers = 0;
  for (const path of sourceFiles(join(ROOT, SCAN_ROOT))) {
    const source = readFileSync(path, "utf8");
    const models = shelfWritesOf(source, detectors);
    if (models.length === 0) {
      continue;
    }
    writers += 1;
    const local = unix(relative(join(ROOT, "apps/lfd-api"), path));
    if (admitted.has(local)) {
      seenAdmitted.add(local);
      continue;
    }
    if (!emitsShelfChanges(source)) {
      failures.push(
        `${SCAN_ROOT}/${local.slice("src/".length)} écrit ${models.join(", ")} sans ShelfChanges : ` +
          `appelez \`shelfChanges.changed(…)\` avec la portée de l'écriture ` +
          `(une société : companyShelves(id) ; sinon ALL_SHELVES), ou inscrivez le fichier ` +
          `à ADMITTED avec sa date et sa raison.`,
      );
    }
  }
  for (const file of admitted) {
    if (!seenAdmitted.has(file)) {
      failures.push(
        `${file} est admis mais n'écrit plus aucun modèle du rayon : retirez-le d'ADMITTED.`,
      );
    }
  }
  if (failures.length > 0) {
    console.error("✗ lint:shelf-writes — qui écrit ce que le rayon lit émet le signal de purge\n");
    for (const failure of failures) {
      console.error(`  · ${failure}`);
    }
    process.exit(1);
  }
  console.log(
    `✓ lint:shelf-writes — ${SHELF_MODELS.length} modèles du rayon, ${writers} fichiers écrivains : ` +
      `tous émettent ShelfChanges (${ADMITTED.length} admis).`,
  );
}

main();

#!/usr/bin/env node
/**
 * Gate : **aucune requête brute ne joint deux schémas.**
 *
 * Le second mur de l'étape B1. Le premier (`context-boundaries`) tient le code ;
 * celui-ci tient la base — et c'est le plus important des deux, parce qu'une
 * jointure ne se voit pas dans un graphe d'imports.
 *
 * Le jour où `pim`, `staff` et `b2b` partagent une base à quatre schémas, une
 * seule requête `pim.products JOIN b2b.orders` suffit à ce que plus personne ne
 * possède rien : le modèle a beau être découpé, la lecture ne l'est plus, et on
 * ne peut plus déplacer un schéma sans casser l'autre. C'est ce qui fait la god
 * app, et ça arrive en une ligne, un soir de fatigue.
 *
 * Une table appartient à **un** schéma. Le franchissement passe par un port —
 * exactement comme il passait par HTTP quand les deux étaient séparés.
 *
 * Ce que le gate NE fait pas : lire les requêtes de Prisma lui-même. Le client
 * généré ne joint que ce que le schéma déclare, et un `@@schema` par modèle
 * garantit déjà l'appartenance. Seul le SQL **écrit à la main** échappe à ça.
 *
 * Usage : `pnpm lint:cross-schema-join` (branché en CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = "apps/lfd-api/src";

/** Les schémas déclarés — même liste que le `datasource` de Prisma. */
const SCHEMAS = ["public", "growth", "staff", "pim", "b2b"];

/** Le client généré n'est pas du code écrit ici. */
const SKIP = new Set(["node_modules", "dist", "client", "coverage"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP.has(entry)) {
        yield* walk(path);
      }
    } else if (path.endsWith(".ts")) {
      yield path;
    }
  }
}

/**
 * Les littéraux passés à `$queryRaw` / `$executeRaw`, gabarits compris.
 *
 * On lit le gabarit **entier** jusqu'au backtick fermant : une jointure écrite
 * sur trois lignes n'est pas moins une jointure.
 */
const RAW = /\$(?:query|execute)Raw(?:Unsafe)?(?:<[^>]*>)?[\s(]*`([\s\S]*?)`/g;

const violations = [];

for (const absolute of walk(join(ROOT, SRC))) {
  const source = readFileSync(absolute, "utf8");
  for (const match of source.matchAll(RAW)) {
    const sql = match[1];
    const touched = SCHEMAS.filter((schema) =>
      new RegExp(`(?:^|[\\s(",])${schema}\\.`, "u").test(sql),
    );
    if (touched.length > 1) {
      violations.push({ file: relative(ROOT, absolute), touched });
    }
  }
}

if (violations.length > 0) {
  console.error("\n❌ Requêtes brutes qui traversent deux schémas :\n");
  for (const { file, touched } of violations) {
    console.error(`   ${file}\n      ${touched.join(" × ")}`);
  }
  console.error(
    "\n   Une table appartient à UN schéma. Le franchissement passe par un port,\n" +
      "   comme il passait par HTTP quand les deux vivaient dans deux processus.",
  );
  process.exit(1);
}

console.log("✅ Aucune requête brute ne joint deux schémas.");

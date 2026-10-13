#!/usr/bin/env node
/**
 * **Recensement** avant le préfixe universel (runbook, « Le préfixe universel
 * de la médiathèque », étape 1) — en partant des DONNÉES, pas du schéma.
 *
 * Toute colonne texte ou jsonb de tous les schémas (lus dans
 * `datasource.prisma`) qui contient une URL du fonds sous `products/` est
 * listée et classée : réécrite par la migration, photographie figée, ou
 * INCONNUE. Une seule inconnue → code de sortie 1, le geste s'arrête.
 *
 * Lecture seule. Usage :
 *   MEDIA_PREFIX_DATABASE_URL=… node dev-toolbox/media-prefix/census.mjs
 */
import { classifyCensus, OLD_URL_PATTERN, schemasOf } from "./prefix-rules.mjs";
import { connectDatabase, datasourceText } from "./runtime.mjs";

const COLUMN_TYPES = ["text", "character varying", "jsonb", "json"];

const db = await connectDatabase();
try {
  const schemas = schemasOf(datasourceText());
  const { rows: columns } = await db.query(
    `SELECT table_schema, table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = ANY($1) AND data_type = ANY($2)
      ORDER BY 1, 2, 3`,
    [schemas, COLUMN_TYPES],
  );
  const hits = [];
  for (const c of columns) {
    const id = (name) => `"${name.replaceAll('"', '""')}"`;
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM ${id(c.table_schema)}.${id(c.table_name)}
        WHERE ${id(c.column_name)}::text ~ $1`,
      [OLD_URL_PATTERN],
    );
    if (rows[0].n > 0) {
      hits.push({ column: `${c.table_schema}.${c.table_name}.${c.column_name}`, rows: rows[0].n });
    }
  }
  const { rows: objects } = await db.query(
    "SELECT count(*)::int AS n FROM media.media_asset WHERE storage_key LIKE 'products/%'",
  );
  const { live, frozen, unknown } = classifyCensus(hits);
  console.log(`Schémas lus : ${schemas.join(", ")}`);
  console.log(`Images encore sous products/ : ${objects[0].n}`);
  for (const [title, list] of [
    ["Réécrites par la migration", live],
    ["Figées (laissées)", frozen],
    ["INCONNUES", unknown],
  ]) {
    console.log(`\n${title} — ${list.length}`);
    for (const hit of list) console.log(`  ${hit.column} : ${hit.rows} ligne(s)`);
  }
  if (unknown.length > 0) {
    console.error(
      "\n✗ Colonne hors du plan : le geste s'arrête. Corriger le plan (§1.2) et la migration avant d'aller plus loin.",
    );
    process.exitCode = 1;
  } else {
    console.log("\n✓ Aucune colonne hors du plan.");
  }
} finally {
  await db.end();
}

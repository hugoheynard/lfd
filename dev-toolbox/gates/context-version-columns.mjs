#!/usr/bin/env node
/**
 * Gate : **toute colonne d'une table de l'instantané du catalogue est classée
 * face à la version de son contexte, et toute table reliée aussi.**
 *
 * Plan : `documentation/caching-usage/le-catalogue-en-memoire.md`, § 2.2,
 * § 3 et § 11 (lot M1a). Demandé par Hugo le 2026-11-05 : « à chaque nouvelle
 * colonne ou table liée au catalogue, on doit regarder si ça bouge le stamp ».
 * Un numéro par contexte depuis le 2026-11-06 (`context_versions`).
 *
 * ## Le trou que cette porte ferme
 *
 * Une ligne de `context_versions` ne monte que sur les colonnes listées dans
 * les `UPDATE OF` des déclencheurs de son contexte. Le jour où l'instantané lit une colonne de plus — ou où
 * une migration en ajoute une que personne ne classe —, une écriture sur elle
 * laisserait servir un instantané périmé : un article masqué encore vendu, un
 * prix d'avant. Rien ne rougirait : ni le typecheck, ni les tests du chargeur.
 *
 * ## Ce qu'elle vérifie
 *
 * 1. Les colonnes « lues » sont celles de la constante
 *    `CATALOGUE_SNAPSHOT_COLUMNS` (`catalogue-snapshot-columns.ts`, que le
 *    chargeur importe pour son `select`), rangées par contexte, traduites par
 *    les `@map` du schéma.
 * 2. Pour chaque table de la constante, le DERNIER déclencheur écrit dans les
 *    migrations qui appelle une fonction `<contexte>_version_bump()` monte sur
 *    `INSERT`, sur `DELETE`, et en `UPDATE OF` sur EXACTEMENT ces colonnes ;
 *    il appelle la fonction de SON contexte — une table rangée sous
 *    `operations` qui ferait monter `catalog` échoue ; aucun déclencheur ne
 *    vise une table hors de la constante.
 * 3. Chaque colonne du schéma de ces tables est soit lue, soit « ignorée » au
 *    registre `catalogue-snapshot-registry.json` avec sa raison ; le registre ne
 *    cite que des colonnes qui existent et ne sont pas lues.
 * 4. Toute table qui porte une relation (`@relation(fields: …)`) vers une
 *    table sous déclencheur est elle-même sous déclencheur, ou classée « hors
 *    de l'instantané » au registre avec sa raison ; une entrée qui n'est plus
 *    reliée est périmée.
 *
 * Elle lit le schéma et les migrations ; elle ne recopie aucune liste de
 * tables.
 *
 * Usage : `pnpm lint:context-version-columns` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PRISMA_SCHEMA_DIR, prismaSchemaSource } from "./lib/prisma-schema.mjs";

const ROOT = process.cwd();
const CATALOG_DIR = "apps/lfd-api/src/b2b/catalog/infrastructure";
export const CONSTANT_PATH = `${CATALOG_DIR}/catalogue-snapshot-columns.ts`;
export const REGISTRY_PATH = `${CATALOG_DIR}/catalogue-snapshot-registry.json`;
const MIGRATIONS_DIR = "apps/lfd-api/prisma/migrations";
/** `"public"."<contexte>_version_bump"()` — la fonction de montée d'un contexte. */
const BUMP = /"public"\."(\w+)_version_bump"\(\)/u;

/** Les modèles du schéma : table SQL, champs → colonne, relations sortantes. */
export function modelsOf(source) {
  const models = new Map();
  const names = new Set([...source.matchAll(/^model\s+(\w+)\s/gmu)].map((m) => m[1]));
  for (const match of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gmu)) {
    const model = { name: match[1], table: match[1], fields: new Map(), relations: [] };
    for (const raw of match[2].split("\n")) {
      readModelLine(raw.trim(), model, names);
    }
    models.set(model.name, model);
  }
  return models;
}

function readModelLine(line, model, names) {
  if (line.startsWith("//")) return;
  const table = /^@@map\("([^"]+)"\)/u.exec(line);
  if (table !== null) {
    model.table = table[1];
    return;
  }
  const field = /^(\w+)\s+(\w+)(\[\])?(\?)?/u.exec(line);
  if (field === null || line.startsWith("@@")) return;
  if (names.has(field[2])) {
    if (line.includes("fields:")) model.relations.push(field[2]);
    return; // une relation n'est pas une colonne
  }
  const mapped = /@map\("([^"]+)"\)/u.exec(line);
  model.fields.set(field[1], mapped === null ? field[1] : mapped[1]);
}

/** `table → { context, fields }`, lu dans le littéral de la constante (contexte → table → champs). */
export function constantOf(source) {
  const body = /CATALOGUE_SNAPSHOT_COLUMNS\s*=\s*\{([\s\S]*)\}\s*as const/u.exec(source)?.[1];
  if (body === undefined) return new Map();
  const tables = new Map();
  for (const context of body.matchAll(/(\w+):\s*\{([^{}]*)\}/gu)) {
    for (const m of context[2].matchAll(/(\w+):\s*\[([^\]]*)\]/gu)) {
      tables.set(m[1], {
        context: context[1],
        fields: [...m[2].matchAll(/"(\w+)"/gu)].map((f) => f[1]),
      });
    }
  }
  return tables;
}

/** Le dernier état de chaque déclencheur de version, migrations dans l'ordre. */
export function triggersOf(migrations) {
  const triggers = new Map();
  for (const { sql } of migrations) {
    const pattern =
      /(CREATE (?:OR REPLACE )?TRIGGER "(\w+)"\s+BEFORE ([\s\S]*?)\s+ON "public"\."(\w+)"\s+FOR EACH STATEMENT EXECUTE FUNCTION ([^;]+);)|(DROP TRIGGER (?:IF EXISTS )?"(\w+)")/gu;
    for (const m of sql.matchAll(pattern)) {
      if (m[6] !== undefined) {
        for (const [table, trigger] of triggers) {
          if (trigger.name === m[7]) triggers.delete(table);
        }
        continue;
      }
      const bump = BUMP.exec(m[5]);
      if (bump === null) continue;
      const events = m[3];
      const columns = /UPDATE OF ([\s\S]*)$/u.exec(events)?.[1] ?? "";
      triggers.set(m[4], {
        name: m[2],
        context: bump[1],
        insert: /\bINSERT\b/u.test(events),
        delete: /\bDELETE\b/u.test(events),
        columns: new Set([...columns.matchAll(/"(\w+)"/gu)].map((c) => c[1])),
      });
    }
  }
  return triggers;
}

const QUESTION = `l'instantané du catalogue doit-il voir cette colonne ?`;

function tableProblems(table, { context, fields }, model, trigger, ignored) {
  const problems = [];
  const read = new Set();
  for (const field of fields) {
    const column = model.fields.get(field);
    if (column === undefined) {
      problems.push(`${table}.${field} : champ de la constante absent du modèle ${model.name}.`);
    } else read.add(column);
  }
  if (trigger === undefined) {
    return [
      ...problems,
      `${table} : aucun déclencheur \`${table}_context_version\` dans les migrations.`,
    ];
  }
  if (trigger.context !== context) {
    problems.push(
      `${table} : rangée sous « ${context} », son déclencheur appelle ` +
        `${trigger.context}_version_bump() — il ferait monter un autre contexte. ` +
        `Appeler "public"."${context}_version_bump"().`,
    );
  }
  if (!trigger.insert || !trigger.delete) {
    problems.push(`${table} : le déclencheur doit monter sur INSERT et sur DELETE.`);
  }
  for (const column of read) {
    if (!trigger.columns.has(column)) {
      problems.push(
        `${table}.${column} : lue par l'instantané, absente de l'UPDATE OF du déclencheur.`,
      );
    }
  }
  for (const column of trigger.columns) {
    if (!read.has(column)) {
      problems.push(
        `${table}.${column} : dans l'UPDATE OF, absente de la constante (${CONSTANT_PATH}).`,
      );
    }
  }
  for (const column of new Set(model.fields.values())) {
    if (!read.has(column) && ignored[column] === undefined) {
      problems.push(
        `${table}.${column} : colonne non classée — ${QUESTION} Si oui, l'ajouter à ` +
          `${CONSTANT_PATH} et à l'UPDATE OF (migration) ; sinon l'écrire en « ignorees » ` +
          `dans ${REGISTRY_PATH}, avec sa raison.`,
      );
    }
  }
  for (const [column, reason] of Object.entries(ignored)) {
    if (![...model.fields.values()].includes(column)) {
      problems.push(`registre — ${table}.${column} : aucune colonne de ce nom (périmée).`);
    } else if (read.has(column)) {
      problems.push(`registre — ${table}.${column} : à la fois lue et ignorée.`);
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      problems.push(
        `registre — ${table}.${column} : une colonne ignorée sans raison ne se lit pas.`,
      );
    }
  }
  return problems;
}

function relatedProblems(models, watched, outside) {
  const problems = [];
  const byName = [...models.values()];
  const related = new Map();
  for (const model of byName) {
    if (watched.has(model.table)) continue;
    const targets = model.relations
      .map((name) => models.get(name)?.table)
      .filter((table) => table !== undefined && watched.has(table));
    if (targets.length > 0) related.set(model.table, targets);
  }
  for (const [table, targets] of related) {
    if (outside[table] === undefined) {
      problems.push(
        `${table} : table reliée à ${targets.join(", ")} (sous déclencheur), non classée — ` +
          `l'instantané du catalogue doit-il la voir ? Sinon l'écrire en « horsInstantane » ` +
          `dans ${REGISTRY_PATH}, avec sa raison.`,
      );
    }
  }
  for (const [table, reason] of Object.entries(outside)) {
    if (!related.has(table)) {
      problems.push(
        `registre — horsInstantane.${table} : plus reliée à une table sous déclencheur (périmée).`,
      );
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      problems.push(
        `registre — horsInstantane.${table} : une table écartée sans raison ne se lit pas.`,
      );
    }
  }
  return problems;
}

/** Tous les refus — pur, testable. */
export function check({ schema, constant, migrations, registry }) {
  const models = modelsOf(schema);
  const byTable = new Map([...models.values()].map((model) => [model.table, model]));
  const columns = constantOf(constant);
  const triggers = triggersOf(migrations);
  const ignoredByTable = registry.ignorees ?? {};
  const problems = [];
  if (columns.size === 0) {
    problems.push(`${CONSTANT_PATH} : CATALOGUE_SNAPSHOT_COLUMNS introuvable ou vide.`);
  }
  for (const [table, entry] of columns) {
    const model = byTable.get(table);
    if (model === undefined) {
      problems.push(`${table} : table de la constante absente du schéma.`);
      continue;
    }
    problems.push(
      ...tableProblems(table, entry, model, triggers.get(table), ignoredByTable[table] ?? {}),
    );
  }
  for (const table of triggers.keys()) {
    if (!columns.has(table)) {
      problems.push(`${table} : déclencheur de version sur une table absente de la constante.`);
    }
  }
  for (const table of Object.keys(ignoredByTable)) {
    if (!columns.has(table))
      problems.push(`registre — ignorees.${table} : table hors de la constante.`);
  }
  problems.push(...relatedProblems(models, new Set(columns.keys()), registry.horsInstantane ?? {}));
  return problems;
}

function readMigrations(root) {
  const dir = join(root, MIGRATIONS_DIR);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name, "migration.sql"), "utf8") }));
}

function main() {
  const problems = check({
    schema: prismaSchemaSource(ROOT),
    constant: readFileSync(join(ROOT, CONSTANT_PATH), "utf8"),
    migrations: readMigrations(ROOT),
    registry: JSON.parse(readFileSync(join(ROOT, REGISTRY_PATH), "utf8")),
  });
  if (problems.length > 0) {
    console.error("\n❌ Les versions par contexte ne disent pas ce que l'instantané lit.\n");
    for (const line of problems) console.error(`   ${line}`);
    console.error(
      `\n   Une colonne lue sans déclencheur sert un catalogue périmé sans le dire.\n` +
        `   Schéma lu : ${PRISMA_SCHEMA_DIR} ; migrations : ${MIGRATIONS_DIR}.\n`,
    );
    process.exit(1);
  }
  console.log(
    "✓ context-version-columns : chaque colonne et chaque table reliée au catalogue est classée face à la version de son contexte.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

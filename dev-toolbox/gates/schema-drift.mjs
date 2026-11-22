#!/usr/bin/env node
/**
 * **schema-drift — le schéma Prisma dit la base** (décidé par Hugo le
 * 2026-11-22).
 *
 * La base est construite par les migrations, et c'est elle qui est en
 * production. Le schéma Prisma n'en est qu'une description : une clé
 * étrangère en `RESTRICT` décrite sans `onDelete`, un index créé en SQL et
 * absent du modèle, un nom de contrainte resté celui d'avant un renommage —
 * Prisma compile, les tests passent, et la prochaine `migrate dev` propose de
 * « corriger » la base dans le mauvais sens.
 *
 * La porte rejoue les migrations sur une base FANTÔME jetable
 * (`prisma migrate diff --from-migrations … --to-schema … --script`) et
 * échoue sur toute instruction qui n'est pas dans la liste admise
 * (`apps/lfd-api/prisma/schema-drift-admitted.json`, chaque écart avec sa
 * raison et sa date). Une entrée admise qui ne sort plus échoue aussi : la
 * liste ne garde que des écarts réels.
 *
 * Elle demande un Postgres (le conteneur de `pnpm dev:infra`, ou le service
 * du job e2e en CI). Sans base, elle échoue en le disant — jamais verte par
 * défaut. La base fantôme est SUPPRIMÉE et recréée à chaque passage : son
 * nom doit finir par `_shadow`, faute de quoi la porte refuse.
 *
 * Usage : `pnpm gate schema-drift`
 * Variable : `SCHEMA_DRIFT_SHADOW_URL` (défaut : la base fantôme locale).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyDrift, normalizeStatement, splitStatements } from "../ci/migration-drift.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const API = join(ROOT, "apps/lfd-api");
export const ADMITTED_FILE = "apps/lfd-api/prisma/schema-drift-admitted.json";
const DEFAULT_SHADOW_URL = "postgresql://lfc:lfc@localhost:5433/lfc_schema_drift_shadow";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Lit et valide la liste admise : chaque écart porte sa raison et sa date. */
export function parseAdmitted(json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.entries)) {
    throw new Error(`${ADMITTED_FILE} : \`entries\` doit être un tableau.`);
  }
  return data.entries.map((entry, index) => {
    const where = `${ADMITTED_FILE}, entrée ${index}`;
    if (typeof entry.statement !== "string" || entry.statement.trim() === "") {
      throw new Error(`${where} : \`statement\` manque.`);
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 10) {
      throw new Error(`${where} : \`reason\` dit pourquoi l'écart est voulu.`);
    }
    if (!DATE.test(entry.since ?? ""))
      throw new Error(`${where} : \`since\` est une date AAAA-MM-JJ.`);
    return { statement: normalizeStatement(entry.statement), reason: entry.reason };
  });
}

/**
 * Refuse une URL de base fantôme dont le nom ne finit pas par `_shadow` :
 * Prisma la vide avant d'y rejouer les migrations.
 */
export function shadowDatabaseName(url) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_shadow")) {
    throw new Error(
      `la base fantôme « ${name} » ne finit pas par « _shadow » : la porte la supprime et la recrée, ` +
        "la porte refuse de la viser. Pose SCHEMA_DRIFT_SHADOW_URL sur une base jetable.",
    );
  }
  return name;
}

/** Le verdict : les lignes à afficher et le code de sortie. */
export function verdict({ unknown, tolerated, stale }) {
  const lines = [];
  if (unknown.length > 0) {
    lines.push(
      "\n✖ schema-drift : le schéma Prisma ne dit plus ce que les migrations construisent.\n",
    );
    for (const statement of unknown) lines.push(`  ✗ ${statement};`);
    lines.push(
      "\n  Chaque ligne mènerait la base au schéma. La base a raison : corrige le SCHÉMA " +
        "(onDelete, map:, @@index, @default…), sans migration — ou, si l'écart est voulu, " +
        `inscris-le avec sa raison dans ${ADMITTED_FILE}.`,
    );
  }
  for (const entry of stale) {
    lines.push(`  ✗ admis mais plus constaté — retire-le de ${ADMITTED_FILE} : ${entry.statement}`);
  }
  if (unknown.length === 0 && stale.length === 0) {
    lines.push(
      `✓ schema-drift : le schéma dit la base (${tolerated.length} écarts admis avec leur raison).`,
    );
    return { lines, code: 0 };
  }
  return { lines, code: 1 };
}

async function ensureShadowDatabase(url) {
  const name = shadowDatabaseName(url);
  const { Client } = createRequire(join(API, "package.json"))("pg");
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `aucun Postgres joignable à ${admin.host} (${error.code ?? error.message}). ` +
        "En local : `pnpm dev:infra`. La porte ne passe pas sans base.",
    );
  }
  try {
    // Recréée à chaque passage : Prisma ne vide que les schémas que le
    // `datasource` liste, et un schéma renommé laisserait son résidu.
    const quoted = `"${name.replaceAll('"', '""')}"`;
    await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoted}`);
  } finally {
    await client.end();
  }
}

function diffScript(shadowUrl) {
  const dir = mkdtempSync(join(tmpdir(), "lfd-schema-drift-"));
  const config = join(dir, "prisma.config.mjs");
  // La seule base nommée est la fantôme : la porte ne peut viser aucune autre.
  writeFileSync(
    config,
    `export default { schema: ${JSON.stringify(join(API, "prisma/schema"))}, ` +
      `migrations: { path: ${JSON.stringify(join(API, "prisma/migrations"))} }, ` +
      `datasource: { url: ${JSON.stringify(shadowUrl)}, shadowDatabaseUrl: ${JSON.stringify(shadowUrl)} } };\n`,
  );
  return execFileSync(
    "pnpm",
    [
      "exec",
      "prisma",
      "migrate",
      "diff",
      "--config",
      config,
      "--from-migrations",
      join(API, "prisma/migrations"),
      "--to-schema",
      join(API, "prisma/schema"),
      "--script",
    ],
    { cwd: API, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
  );
}

async function main() {
  const shadowUrl = process.env["SCHEMA_DRIFT_SHADOW_URL"] ?? DEFAULT_SHADOW_URL;
  await ensureShadowDatabase(shadowUrl);
  const admitted = parseAdmitted(readFileSync(join(ROOT, ADMITTED_FILE), "utf8"));
  const result = classifyDrift(splitStatements(diffScript(shadowUrl)), admitted);
  const { lines, code } = verdict(result);
  console.log(lines.join("\n"));
  return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    const detail =
      typeof error.stderr === "string" && error.stderr !== "" ? `\n${error.stderr}` : "";
    console.error(
      `\n✖ schema-drift : la comparaison n'a pas pu se faire — ${error.message}${detail}`,
    );
    process.exitCode = 1;
  }
}

// La vérification de dérive avant migration — lecture seule.
//
// Compare la base de production à ce que décrivent les migrations QU'ELLE A
// DÉJÀ APPLIQUÉES, retire les écarts inscrits dans
// `apps/lfd-api/prisma/known-drift.json`, et dit ce qui reste. Une table que les
// migrations créent et que la base n'a pas fait échouer `migrate deploy` à mi-
// course (42P01) : on veut l'apprendre avant la première écriture.
//
// Pourquoi `--from-migrations` et pas `--from-schema` : le schéma courant
// contient aussi les migrations À VENIR, dont chaque instruction sortirait en
// écart à chaque déploiement qui en porte une. Les migrations rejouées sur une
// base fantôme décrivent exactement ce que la base devrait être — à condition
// d'en retirer celles que `migrate status` dit en attente, ce que fait ce script.
//
// Usage (depuis apps/lfd-api, DATABASE_LFD_URL et SHADOW_DATABASE_URL posés) :
//   node ../../dev-toolbox/ci/migration-drift.mjs --mode report|enforce
// Code de sortie : 0 sans écart non inscrit (ou en mode report), 1 sinon ;
// 2 si la comparaison elle-même n'a pas pu se faire (en mode enforce seulement).
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Les migrations que `prisma migrate status` liste comme non appliquées. */
export function pendingMigrations(statusOutput, migrationNames) {
  const known = new Set(migrationNames);
  const lines = statusOutput.split(/\r?\n/).map((l) => l.trim());
  const start = lines.findIndex((l) => /not yet been applied/i.test(l));
  if (start === -1) return [];
  const pending = [];
  for (const line of lines.slice(start + 1)) {
    if (known.has(line)) pending.push(line);
    else if (line !== "" && pending.length > 0) break;
  }
  return pending;
}

/** Une instruction, espaces écrasés : la forme sous laquelle on compare. */
export function normalizeStatement(sql) {
  return sql.replace(/\s+/g, " ").trim().replace(/;$/, "").trim();
}

/** Découpe le `--script` de `migrate diff` en instructions, commentaires ôtés. */
export function splitStatements(script) {
  const withoutComments = script
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(/;\s*(?:\r?\n|$)/)
    .map(normalizeStatement)
    .filter((s) => s !== "" && !TRANSACTION_MARKERS.has(s.toUpperCase()));
}

// Prisma enveloppe certains changements (un enum refait) dans une transaction :
// ses bornes ne sont pas des écarts.
const TRANSACTION_MARKERS = new Set(["BEGIN", "COMMIT"]);

/** Lit et valide le registre des écarts connus : chacun porte sa raison. */
export function parseKnownDrift(json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.entries))
    throw new Error("known-drift.json : `entries` doit être un tableau.");
  return data.entries.map((e, i) => {
    if (typeof e.statement !== "string" || e.statement.trim() === "")
      throw new Error(`known-drift.json, entrée ${i} : \`statement\` manque.`);
    if (typeof e.reason !== "string" || e.reason.trim() === "")
      throw new Error(
        `known-drift.json, entrée ${i} : \`reason\` manque — un écart inscrit dit pourquoi on le tolère.`,
      );
    return { statement: normalizeStatement(e.statement), reason: e.reason };
  });
}

/** Partage les écarts en inscrits / non inscrits ; rend aussi les inscriptions devenues inutiles. */
export function classifyDrift(statements, known) {
  const knownSet = new Set(known.map((k) => k.statement));
  const seen = new Set(statements);
  return {
    unknown: statements.filter((s) => !knownSet.has(s)),
    tolerated: statements.filter((s) => knownSet.has(s)),
    stale: known.filter((k) => !seen.has(k.statement)),
  };
}

/** Le texte du journal. */
export function formatReport({ unknown, tolerated, stale }) {
  const out = [];
  out.push(`Écarts tolérés (inscrits) : ${tolerated.length}`);
  for (const s of stale) out.push(`  · inscrit mais plus constaté — à retirer : ${s.statement}`);
  if (unknown.length === 0) {
    out.push("Aucun écart non inscrit : la base est ce que ses migrations appliquées décrivent.");
  } else {
    out.push(
      `Écarts NON inscrits : ${unknown.length} — ce que les migrations appliquées décrivent et que la base n'a pas (ou l'inverse) :`,
    );
    for (const s of unknown) out.push(`  ✗ ${s};`);
    out.push(
      "Chaque ligne est l'instruction qui ramènerait la base à ses migrations. Corriger la base, ou inscrire l'écart avec sa raison dans apps/lfd-api/prisma/known-drift.json.",
    );
  }
  return out.join("\n");
}

function prisma(args, { allowFail = false } = {}) {
  try {
    return execFileSync("pnpm", ["exec", "prisma", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (allowFail && typeof error.stdout === "string")
      return `${error.stdout}\n${error.stderr ?? ""}`;
    throw error;
  }
}

function appliedMigrationsCopy(migrationsDir, pending) {
  const dir = mkdtempSync(join(tmpdir(), "lfd-drift-"));
  const target = join(dir, "migrations");
  cpSync(migrationsDir, target, {
    recursive: true,
    filter: (src) =>
      !pending.some(
        (name) =>
          src === join(migrationsDir, name) || src.startsWith(join(migrationsDir, name) + "/"),
      ),
  });
  // Config jetable : la base de production en datasource, la base fantôme à côté.
  const config = join(dir, "prisma.config.mjs");
  writeFileSync(
    config,
    `export default { schema: ${JSON.stringify(resolve("prisma/schema"))}, migrations: { path: ${JSON.stringify(target)} },` +
      ` datasource: { url: process.env.DATABASE_LFD_URL, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } };\n`,
  );
  return { target, config };
}

function main() {
  const mode = process.argv.includes("--mode")
    ? process.argv[process.argv.indexOf("--mode") + 1]
    : "report";
  const migrationsDir = resolve("prisma/migrations");
  const names = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const pending = pendingMigrations(prisma(["migrate", "status"], { allowFail: true }), names);
  console.log(
    `Migrations en attente, exclues de la comparaison : ${pending.length ? pending.join(", ") : "aucune"}`,
  );
  const { target, config } = appliedMigrationsCopy(migrationsDir, pending);
  const script = prisma([
    "migrate",
    "diff",
    "--config",
    config,
    "--from-migrations",
    target,
    "--to-config-datasource",
    "--script",
  ]);
  const known = parseKnownDrift(readFileSync(resolve("prisma/known-drift.json"), "utf8"));
  const result = classifyDrift(splitStatements(script), known);
  console.log(formatReport(result));
  if (result.unknown.length === 0) return 0;
  if (mode === "enforce") {
    console.log(
      "::error::Dérive de schéma non inscrite : le déploiement s'arrête AVANT toute écriture en base.",
    );
    return 1;
  }
  console.log(
    `::warning::Dérive de schéma non inscrite (${result.unknown.length}) — mode rapport seulement, le déploiement continue.`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const enforce = process.argv.includes("enforce");
  try {
    process.exitCode = main();
  } catch (error) {
    console.log(
      `::${enforce ? "error" : "warning"}::La comparaison de dérive n'a pas pu se faire : ${error.message}`,
    );
    process.exitCode = enforce ? 2 : 0;
  }
}

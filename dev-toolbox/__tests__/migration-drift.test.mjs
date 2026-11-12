// node --test dev-toolbox/__tests__/migration-drift.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyDrift,
  formatReport,
  normalizeStatement,
  parseKnownDrift,
  pendingMigrations,
  splitStatements,
} from "../ci/migration-drift.mjs";

const NAMES = ["20261101000000_a", "20261112000000_b", "20261112100000_c"];

test("lit les migrations en attente dans la sortie de migrate status", () => {
  const out = `3 migrations found in prisma/migrations\nFollowing migrations have not yet been applied:\n20261112000000_b\n20261112100000_c\n\nTo apply migrations in production run prisma migrate deploy.`;
  assert.deepEqual(pendingMigrations(out, NAMES), ["20261112000000_b", "20261112100000_c"]);
});

test("aucune migration en attente quand la base est à jour", () => {
  assert.deepEqual(pendingMigrations("Database schema is up to date!", NAMES), []);
});

test("ignore une ligne qui n'est pas un dossier de migration", () => {
  const out = `Following migration have not yet been applied:\n20261112000000_b\ninconnue`;
  assert.deepEqual(pendingMigrations(out, NAMES), ["20261112000000_b"]);
});

test("découpe le script en instructions, commentaires ôtés, espaces écrasés", () => {
  const script = `-- CreateTable\nCREATE TABLE "pim"."nutrition_declaration" (\n  "id" TEXT NOT NULL\n);\n\n-- DropIndex\nDROP INDEX "public"."x_idx";\n`;
  assert.deepEqual(splitStatements(script), [
    `CREATE TABLE "pim"."nutrition_declaration" ( "id" TEXT NOT NULL )`,
    `DROP INDEX "public"."x_idx"`,
  ]);
});

test("les bornes de transaction ne sont pas des écarts", () => {
  assert.deepEqual(splitStatements(`BEGIN;\nALTER TYPE "a" RENAME TO "b";\nCOMMIT;\n`), [
    `ALTER TYPE "a" RENAME TO "b"`,
  ]);
});

test("un script vide ne rend aucun écart", () => {
  assert.deepEqual(splitStatements("-- This is an empty migration.\n"), []);
});

test("refuse une inscription sans raison", () => {
  assert.throws(
    () => parseKnownDrift(JSON.stringify({ entries: [{ statement: "DROP INDEX x" }] })),
    /reason/,
  );
});

test("retire les écarts inscrits, garde les autres, signale les inscriptions périmées", () => {
  const known = parseKnownDrift(
    JSON.stringify({
      entries: [
        { statement: 'DROP INDEX  "public"."x_idx";', reason: "index posé à la main" },
        { statement: "DROP TABLE gone", reason: "déjà corrigé" },
      ],
    }),
  );
  const result = classifyDrift(
    [normalizeStatement('DROP INDEX "public"."x_idx"'), "CREATE TABLE t ( id TEXT )"],
    known,
  );
  assert.deepEqual(result.unknown, ["CREATE TABLE t ( id TEXT )"]);
  assert.deepEqual(result.tolerated, ['DROP INDEX "public"."x_idx"']);
  assert.deepEqual(
    result.stale.map((s) => s.statement),
    ["DROP TABLE gone"],
  );
});

test("le rapport liste chaque écart non inscrit", () => {
  const text = formatReport({ unknown: ["CREATE TABLE t ( id TEXT )"], tolerated: [], stale: [] });
  assert.match(text, /NON inscrits : 1/);
  assert.match(text, /✗ CREATE TABLE t \( id TEXT \);/);
});

test("le registre du dépôt se lit", async () => {
  const { readFileSync } = await import("node:fs");
  const json = readFileSync(
    new URL("../../apps/lfd-api/prisma/known-drift.json", import.meta.url),
    "utf8",
  );
  assert.ok(Array.isArray(parseKnownDrift(json)));
});

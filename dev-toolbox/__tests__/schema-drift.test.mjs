// node --test dev-toolbox/__tests__/schema-drift.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { classifyDrift } from "../ci/migration-drift.mjs";
import {
  ADMITTED_FILE,
  parseAdmitted,
  shadowDatabaseName,
  verdict,
} from "../gates/schema-drift.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const entry = (statement) => ({
  statement,
  reason: "Un écart voulu, et pourquoi.",
  since: "2026-11-22",
});

test("la liste admise réelle se lit : chaque entrée a sa raison et sa date", () => {
  assert.ok(parseAdmitted(readFileSync(`${ROOT}/${ADMITTED_FILE}`, "utf8")).length > 0);
});

test("refuse une entrée sans raison ou sans date", () => {
  const noReason = JSON.stringify({
    entries: [{ statement: "DROP INDEX x", since: "2026-11-22" }],
  });
  assert.throws(() => parseAdmitted(noReason), /reason/);
  const noDate = JSON.stringify({
    entries: [{ statement: "DROP INDEX x", reason: "Une raison assez longue." }],
  });
  assert.throws(() => parseAdmitted(noDate), /since/);
});

test("refuse une base fantôme qui ne finit pas par _shadow : Prisma la vide", () => {
  assert.equal(
    shadowDatabaseName("postgresql://u:p@h:5433/lfc_schema_drift_shadow"),
    "lfc_schema_drift_shadow",
  );
  assert.throws(() => shadowDatabaseName("postgresql://u:p@h:5433/lfc_b2b_dev"), /_shadow/);
});

test("vert quand seuls les écarts admis sortent", () => {
  const admitted = parseAdmitted(JSON.stringify({ entries: [entry('DROP INDEX "a"')] }));
  assert.equal(verdict(classifyDrift(['DROP INDEX "a"'], admitted)).code, 0);
});

test("rouge sur un écart non admis, en le nommant", () => {
  const admitted = parseAdmitted(JSON.stringify({ entries: [entry('DROP INDEX "a"')] }));
  const { code, lines } = verdict(classifyDrift(['DROP INDEX "a"', 'DROP INDEX "b"'], admitted));
  assert.equal(code, 1);
  assert.ok(lines.some((line) => line.includes('DROP INDEX "b"')));
});

test("rouge sur une entrée admise qui ne sort plus", () => {
  const admitted = parseAdmitted(JSON.stringify({ entries: [entry('DROP INDEX "a"')] }));
  const { code, lines } = verdict(classifyDrift([], admitted));
  assert.equal(code, 1);
  assert.ok(lines.some((line) => line.includes("plus constaté")));
});

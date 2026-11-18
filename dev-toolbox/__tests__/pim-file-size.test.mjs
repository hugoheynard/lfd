// node --test dev-toolbox/__tests__/pim-file-size.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { LIMIT, lineCount, verdict } from "../gates/pim-file-size.mjs";

const ADMITTED = { "journal/pim-journal.ts": { since: "2026-11-18", reason: "vocabulaire" } };

test("lignes : au sens de wc -l", () => {
  assert.equal(lineCount("a\nb\n"), 2);
  assert.equal(lineCount("a\nb"), 2);
  assert.equal(lineCount(""), 0);
});

test("sous le seuil, ou admis : rien à dire", () => {
  const sizes = new Map([
    ["a.ts", LIMIT],
    ["journal/pim-journal.ts", 900],
  ]);
  assert.deepEqual(verdict(sizes, { admitted: ADMITTED }), []);
});

test("un fichier neuf au-delà du seuil échoue", () => {
  assert.match(verdict(new Map([["a.ts", LIMIT + 1]]), {}).join(), /découpe-le/u);
});

test("la dette : à sa ligne passe, au-dessus échoue, en dessous demande de baisser", () => {
  const debt = { files: { "a.ts": 400 } };
  assert.deepEqual(verdict(new Map([["a.ts", 400]]), debt), []);
  assert.match(verdict(new Map([["a.ts", 401]]), debt).join(), /ne grossit plus/u);
  assert.match(verdict(new Map([["a.ts", 350]]), debt).join(), /baisse la ligne/u);
});

test("un fichier résolu ou disparu encore inscrit échoue", () => {
  const debt = { files: { "a.ts": 400, "gone.ts": 500 } };
  const failures = verdict(new Map([["a.ts", 200]]), debt);
  assert.equal(failures.length, 2);
  assert.match(failures.join(), /retire-le de la dette/u);
});

test("un admis sans raison, ou absent, échoue", () => {
  const failures = verdict(new Map(), { admitted: { "x.ts": { since: "2026-11-18" } } });
  assert.equal(failures.length, 2);
});

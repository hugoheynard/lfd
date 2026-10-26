import assert from "node:assert/strict";
import { test } from "node:test";

import { compareAxe, sortedBaseline } from "../accessibilite/axe-baseline-compare.mjs";

const BASE = { "visitor/shop@1280": { "target-size": 2 } };

test("rend vert quand les comptes égalent la référence", () => {
  const r = compareAxe(BASE, { "visitor/shop@1280": { "target-size": 2 } });
  assert.deepEqual(r, { regressions: [], repaid: [], missingPages: [], newPages: [] });
});

test("une règle nouvelle sur une page est une régression", () => {
  const r = compareAxe(BASE, { "visitor/shop@1280": { "target-size": 2, "color-contrast": 1 } });
  assert.equal(r.regressions.length, 1);
  assert.match(r.regressions[0], /color-contrast : 1 nœud\(s\), 0 admis/);
});

test("un compte qui augmente est une régression", () => {
  const r = compareAxe(BASE, { "visitor/shop@1280": { "target-size": 3 } });
  assert.equal(r.regressions.length, 1);
});

test("un compte qui baisse ou une règle disparue doit être rayé de la référence", () => {
  assert.equal(compareAxe(BASE, { "visitor/shop@1280": { "target-size": 1 } }).repaid.length, 1);
  assert.equal(compareAxe(BASE, { "visitor/shop@1280": {} }).repaid.length, 1);
});

test("une page inscrite qui n'a pas été mesurée, et une page neuve, sont signalées", () => {
  const r = compareAxe(BASE, { "pro/cart@320": {} });
  assert.deepEqual(r.missingPages, ["visitor/shop@1280"]);
  assert.deepEqual(r.newPages, ["pro/cart@320"]);
});

test("la référence régénérée est triée", () => {
  const s = sortedBaseline({ b: { z: 1, a: 2 }, a: {} });
  assert.equal(JSON.stringify(s), JSON.stringify({ a: {}, b: { a: 2, z: 1 } }));
});

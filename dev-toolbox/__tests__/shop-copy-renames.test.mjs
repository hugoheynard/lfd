// node --test dev-toolbox/__tests__/shop-copy-renames.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { vanishedKeys } from "../shop-copy/embedded.mjs";

const manifest = (...keys) =>
  JSON.stringify({ spaces: [{ space: "s", entries: keys.map((key) => ({ key })) }] });

test("une clé qui disparaît sans entrée est refusée", () => {
  assert.deepEqual(vanishedKeys(manifest("s.a", "s.b"), manifest("s.a"), {}), ["s.b"]);
});

test("un renommage vers une clé qui existe l'accepte", () => {
  assert.deepEqual(
    vanishedKeys(manifest("s.a", "s.b"), manifest("s.a", "s.c"), { "s.b": "s.c" }),
    [],
  );
});

test("un renommage vers une clé absente ne l'accepte pas", () => {
  assert.deepEqual(vanishedKeys(manifest("s.b"), manifest("s.a"), { "s.b": "s.c" }), ["s.b"]);
});

test("un retrait déclaré (null) est une disparition voulue", () => {
  assert.deepEqual(vanishedKeys(manifest("s.a", "s.b"), manifest("s.a"), { "s.b": null }), []);
});

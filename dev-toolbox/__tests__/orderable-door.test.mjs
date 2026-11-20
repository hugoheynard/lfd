// node --test dev-toolbox/__tests__/orderable-door.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { DOOR, comparisonsIn, verdict } from "../gates/orderable-door.mjs";

test("refuse : la marque comparée à la main, dans les deux sens", () => {
  assert.deepEqual(comparisonsIn('if (item.reservation === "other") {}'), [1]);
  assert.deepEqual(comparisonsIn('x.filter((a) => a.reservation !== "other");'), [1]);
  assert.deepEqual(comparisonsIn('const l = item?.reservation === "other";'), [1]);
  assert.deepEqual(comparisonsIn('\nif ("other" === item.reservation) {}'), [2]);
});

test("admet : un commentaire, une autre valeur, un autre champ", () => {
  assert.deepEqual(comparisonsIn('// item.reservation === "other"'), []);
  assert.deepEqual(comparisonsIn('/* reservation === "other" */'), []);
  assert.deepEqual(comparisonsIn('if (item.reservation === "mine") {}'), []);
  assert.deepEqual(comparisonsIn('if (settlement !== "other") {}'), []);
});

test("la porte et les tests sont admis, un lecteur neuf échoue", () => {
  const compare = 'if (item.reservation === "other") {}';
  const failures = verdict([
    { path: DOOR, source: compare },
    { path: "apps/lfd-api/src/x/__tests__/a.spec.ts", source: compare },
    { path: "apps/lfd-api/src/x/reader.ts", source: compare },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /reader\.ts:1 {2}compare la réservation/);
});

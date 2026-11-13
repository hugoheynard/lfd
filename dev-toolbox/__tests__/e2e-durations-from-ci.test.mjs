// node --test dev-toolbox/__tests__/e2e-durations-from-ci.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertGreen,
  CI_TO_LOCAL_RATIO,
  DurationsRefusal,
  mergeShards,
  missingSuites,
  toLocalFile,
} from "../ci/e2e-durations-from-ci.mjs";

test("fusionne les éclats en un seul relevé", () => {
  assert.deepEqual(mergeShards([{ "test/a": 1 }, { "test/b": 2 }]), { "test/a": 1, "test/b": 2 });
});

test("refuse une suite mesurée par deux éclats", () => {
  assert.throws(() => mergeShards([{ "test/a": 1 }, { "test/a": 2 }]), DurationsRefusal);
});

test("refuse une durée qui n'est pas un nombre", () => {
  assert.throws(() => mergeShards([{ "test/a": "1" }]), DurationsRefusal);
});

test("nomme les suites du disque que le run n'a pas mesurées", () => {
  assert.deepEqual(missingSuites(["test/a", "test/b", "test/c"], { "test/b": 1 }), [
    "test/a",
    "test/c",
  ]);
});

test("écrit trié par nom, à l'échelle locale, arrondi, sans les suites disparues", () => {
  const out = toLocalFile({ "test/b": 2900, "test/a": 1000, "test/gone": 5 }, ["test/b", "test/a"]);
  assert.equal(Object.keys(JSON.parse(out)).join(), "test/a,test/b");
  assert.deepEqual(JSON.parse(out), {
    "test/a": Math.round(1000 / CI_TO_LOCAL_RATIO),
    "test/b": 1000,
  });
  assert.ok(out.endsWith("}\n"));
});

test("refuse un run rouge ou en cours", () => {
  assert.throws(
    () => assertGreen({ databaseId: 1, status: "completed", conclusion: "failure" }),
    DurationsRefusal,
  );
  assert.throws(
    () => assertGreen({ databaseId: 1, status: "in_progress", conclusion: null }),
    DurationsRefusal,
  );
  assert.doesNotThrow(() =>
    assertGreen({ databaseId: 1, status: "completed", conclusion: "success" }),
  );
});

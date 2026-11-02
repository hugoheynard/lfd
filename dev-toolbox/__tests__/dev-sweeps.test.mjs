// node --test dev-toolbox/__tests__/dev-sweeps.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dueSweeps, FIVE_MINUTES_MS, HOUR_MS, unclassifiedWorkerPaths } from "../dev-sweeps.mjs";

const WORKER = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "apps",
  "lfd-api",
  "container",
  "worker.ts",
);

/** Un instant pile sur une heure, puis des décalages. */
const H = 1000 * HOUR_MS;

test("les cinq minutes partent à la première passe, l'heure non", () => {
  assert.deepEqual(dueSweeps(H + 1, { fiveMinutes: null, hour: null }), ["fiveMinutes"]);
});

test("les cinq minutes repartent après cinq minutes, pas avant", () => {
  assert.deepEqual(dueSweeps(H + FIVE_MINUTES_MS - 1, { fiveMinutes: H, hour: H }), []);
  assert.deepEqual(dueSweeps(H + FIVE_MINUTES_MS, { fiveMinutes: H, hour: H }), ["fiveMinutes"]);
});

test("l'heure part au changement d'heure, une fois", () => {
  const last = { fiveMinutes: H + HOUR_MS - 1, hour: H + 10 };
  assert.deepEqual(dueSweeps(H + HOUR_MS, last), ["hour"]);
  assert.deepEqual(dueSweeps(H + HOUR_MS + 1, { ...last, hour: H + HOUR_MS }), []);
});

test("toute route du Worker est rangée : rejouée en dev, ou écartée avec sa raison", () => {
  assert.deepEqual(unclassifiedWorkerPaths(readFileSync(WORKER, "utf8")), []);
});

test("une route neuve du Worker est signalée", () => {
  assert.deepEqual(unclassifiedWorkerPaths('postSweep(env, token, "admin/neuf/sweep");'), [
    "admin/neuf/sweep",
  ]);
});

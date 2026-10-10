// node --test dev-toolbox/__tests__/api-dev.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backoffDelay,
  catchUpVerdict,
  isRelevantChange,
  isTscReady,
  watchdogVerdict,
  SILENCE_LIMIT_MS,
} from "../api-dev-policy.mjs";

test("le délai croît 2 s, 5 s, 15 s puis plafonne à 30 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 50].map(backoffDelay), [2000, 5000, 15000, 30000, 30000, 30000]);
});

test("seul un fichier JavaScript déclenche une relance", () => {
  assert.equal(isRelevantChange("pim/x.js"), true);
  assert.equal(isRelevantChange("index.mjs"), true);
  assert.equal(isRelevantChange("x.js.map"), false);
  assert.equal(isRelevantChange(".tsbuildinfo"), false);
  assert.equal(isRelevantChange(null), false);
});

test("reconnaît la fin de passe de tsc --watch", () => {
  assert.equal(isTscReady("12:00:00 - Found 0 errors. Watching for file changes."), true);
  assert.equal(isTscReady("Starting compilation in watch mode..."), false);
});

const T0 = 1_000_000;

test("rien à garder sans enfant vivant", () => {
  assert.equal(
    watchdogVerdict({
      now: T0 + 10 * SILENCE_LIMIT_MS,
      alive: false,
      startedAt: T0,
      lastHealthyAt: null,
    }),
    "idle",
  );
});

test("ne relance jamais pendant la première minute d'un démarrage", () => {
  assert.equal(
    watchdogVerdict({
      now: T0 + SILENCE_LIMIT_MS - 1,
      alive: true,
      startedAt: T0,
      lastHealthyAt: null,
    }),
    "grace",
  );
});

test("relance une API vivante mais muette depuis une minute", () => {
  assert.equal(
    watchdogVerdict({
      now: T0 + SILENCE_LIMIT_MS,
      alive: true,
      startedAt: T0,
      lastHealthyAt: null,
    }),
    "restart",
  );
  assert.equal(
    watchdogVerdict({
      now: T0 + 3 * SILENCE_LIMIT_MS,
      alive: true,
      startedAt: T0,
      lastHealthyAt: T0 + 2 * SILENCE_LIMIT_MS - 1,
    }),
    "restart",
  );
});

test("une réponse saine récente la laisse tranquille", () => {
  assert.equal(
    watchdogVerdict({
      now: T0 + 3 * SILENCE_LIMIT_MS,
      alive: true,
      startedAt: T0,
      lastHealthyAt: T0 + 3 * SILENCE_LIMIT_MS - 1_000,
    }),
    "ok",
  );
});

test("rattrape la base seulement quand toutes les migrations attendues sont commitées", () => {
  const pending = ["20261010180000_les_series"];
  assert.equal(catchUpVerdict({ local: true, pending, uncommitted: [] }), "apply");
  assert.equal(catchUpVerdict({ local: true, pending, uncommitted: pending }), "wait");
  assert.equal(catchUpVerdict({ local: false, pending, uncommitted: [] }), "retry");
  assert.equal(catchUpVerdict({ local: true, pending: [], uncommitted: [] }), "retry");
});

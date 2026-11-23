// node --test dev-toolbox/__tests__/export-key-guard.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { CONTROLLER, GUARD, MODULE, mentionsIn, verdict } from "../gates/export-key-guard.mjs";

const USE = "@UseGuards(ExportReaderKeyGuard)\nexport class X {}";

test("voit la garde nommée, pas citée en commentaire", () => {
  assert.deepEqual(mentionsIn(USE), [1]);
  assert.deepEqual(mentionsIn("// ExportReaderKeyGuard\n/* ExportReaderKeyGuard */"), []);
  assert.deepEqual(mentionsIn("const ExportReaderKeyGuards = 1;"), []);
});

test("la garde, le contrôleur d'export, le module et les tests sont admis", () => {
  const failures = verdict([
    { path: GUARD, source: "export class ExportReaderKeyGuard {}" },
    { path: CONTROLLER, source: USE },
    { path: MODULE, source: "providers: [ExportReaderKeyGuard]" },
    { path: "apps/lfd-api/src/x/__tests__/a.spec.ts", source: USE },
  ]);
  assert.deepEqual(failures, []);
});

test("un autre contrôleur qui la pose échoue, avec son fichier", () => {
  const failures = verdict([
    { path: "apps/lfd-api/src/lafoliecoffee/orders/http/orders.controller.ts", source: USE },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /orders\.controller\.ts:1 {2}nomme ExportReaderKeyGuard/);
});

test("le module qui en ferait une garde globale échoue", () => {
  const failures = verdict([
    {
      path: MODULE,
      source: "providers: [{ provide: APP_GUARD, useClass: ExportReaderKeyGuard }]",
    },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /APP_GUARD/);
});

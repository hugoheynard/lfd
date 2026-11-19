// node --test dev-toolbox/__tests__/order-deadline-door.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { ADMITTED, judgementImportsIn, verdict } from "../gates/order-deadline-door.mjs";

const GUARD_IMPORT =
  'import { decideStrictestOrderCutoff } from "../../orders/domain/services/order-cutoff-guard.js";';

test("refuse : l'ancien jugement importé", () => {
  assert.deepEqual(judgementImportsIn(GUARD_IMPORT), [[1, "order-cutoff-guard"]]);
  assert.deepEqual(
    judgementImportsIn('import { OrderCutoffGate } from "./order-cutoff-gate.service.js";'),
    [[1, "order-cutoff-gate.service"]],
  );
  assert.deepEqual(
    judgementImportsIn('import { LateFeeJudgement } from "./late-fee-judgement.service.js";'),
    [[1, "late-fee-judgement.service"]],
  );
});

test("refuse : une fonction de décision du contrat, dans un import multi-ligne", () => {
  const source = 'import {\n  type OrderCutoffView,\n  decideOrderLimit,\n} from "@lfd/contracts";';
  assert.deepEqual(judgementImportsIn(source), [[1, "decideOrderLimit"]]);
});

test("admet : un annonceur du contrat, un commentaire, un nom voisin", () => {
  assert.deepEqual(judgementImportsIn('import { nextFulfillmentDay } from "@lfd/contracts";'), []);
  assert.deepEqual(judgementImportsIn("// voir order-cutoff-guard.js et decideOrderCutoff"), []);
  assert.deepEqual(judgementImportsIn('import { x } from "./order-cutoff-guard-foreseen.js";'), []);
});

test("le juge est admis, un fichier neuf échoue, une dette propre aussi", () => {
  const judge = Object.keys(ADMITTED)[0];
  const files = [
    { path: `${judge}judge.ts`, source: 'import { decideOrderLimit } from "@lfd/contracts";' },
    { path: "apps/lfd-api/src/neuf.ts", source: GUARD_IMPORT },
    { path: "apps/lfd-api/src/propre.ts", source: "export const x = 1;" },
  ];
  const { failures, remaining } = verdict(files, ["apps/lfd-api/src/propre.ts"], ADMITTED);
  assert.equal(remaining.length, 0);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /neuf\.ts:1 {2}importe order-cutoff-guard/);
  assert.match(failures[1], /propre\.ts {2}inscrit en dette mais propre/);
});

// node --test dev-toolbox/__tests__/send-now-admitted.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { ADMITTED, callsIn, verdict } from "../gates/send-now-admitted.mjs";

const PATH = "apps/lfd-api/src/b2b/x/sender.ts";
const CALLER = [
  "export class X {",
  "  async go() {",
  "    await this.mails.sendNow({ template: 't' });",
  "  }",
  "}",
].join("\n");

test("admet : un appel depuis un fichier admis", () => {
  const { failures } = verdict([{ path: PATH, source: CALLER }], { [PATH]: "raison" });
  assert.deepEqual(failures, []);
});

test("refuse : un appel hors liste, en disant quoi faire", () => {
  const { failures } = verdict([{ path: PATH, source: CALLER }], {});
  assert.equal(failures.length, 1);
  assert.match(failures[0], /apps\/lfd-api\/src\/b2b\/x\/sender\.ts:3 /);
  assert.match(failures[0], /modèle « t »/);
  assert.match(failures[0], /sans outbox/);
  assert.match(failures[0], /request dans une unité de travail/);
  assert.match(failures[0], /ADMITTED .*raison et la date/);
});

test("refuse : une entrée admise qui n'appelle plus sendNow", () => {
  const source = "await this.mails.request({ template: 't' });";
  const { failures } = verdict([{ path: PATH, source }], { [PATH]: "raison" });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /sender\.ts .*n'appelle plus sendNow.*retire-la de ADMITTED/);
});

test("ignore : un commentaire qui cite sendNow(", () => {
  assert.deepEqual(callsIn("/** appeler `sendNow()` après */\n// sendNow(x)\nconst a = 1;"), []);
  assert.deepEqual(verdict([{ path: PATH, source: "// this.mails.sendNow({})" }], {}).failures, []);
});

test("ignore : le bloc mail lui-même", () => {
  const path = "apps/lfd-api/src/mail/requests/application/check.ts";
  assert.deepEqual(verdict([{ path, source: CALLER }], {}).failures, []);
});

test("voit : un appel typé sendNow<K>(", () => {
  assert.deepEqual(callsIn("x.sendNow<'a'>({})"), [1]);
});

test("chaque entrée admise porte sa date et sa raison", () => {
  for (const reason of Object.values(ADMITTED)) assert.match(reason, /^2026-11-06, .+ — .+/);
});

test("compte : les appels admis, plusieurs par fichier", () => {
  const source = `${CALLER}\nthis.mails.sendNow({ template: "u" });`;
  assert.equal(verdict([{ path: PATH, source }], { [PATH]: "r" }).admittedCalls, 2);
});

test("lit : le modèle appelé, ou le dit illisible", () => {
  assert.deepEqual(callsIn(CALLER), [3]);
  assert.match(
    verdict([{ path: PATH, source: "m.sendNow(demand);" }], {}).failures[0],
    /modèle non lisible/,
  );
});

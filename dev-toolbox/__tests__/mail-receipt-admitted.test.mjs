// node --test dev-toolbox/__tests__/mail-receipt-admitted.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { ADMITTED, callsIn, misnamedInjections, verdict } from "../gates/mail-receipt-admitted.mjs";

const PATH = "apps/lfd-api/src/lafoliecoffee/x/sender.ts";
const CALLER = [
  "export class X {",
  "  async go() {",
  "    await this.mail.sendAndAwaitReceipt({ template: 't' });",
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
  assert.match(failures[0], /apps\/lfd-api\/src\/lafoliecoffee\/x\/sender\.ts:3 /);
  assert.match(failures[0], /mail\.sendAndAwaitReceipt hors liste/);
  assert.match(failures[0], /modèle « t »/);
  assert.match(failures[0], /sans outbox/);
  assert.match(failures[0], /mail\.send dans une unité de travail/);
  assert.match(failures[0], /ADMITTED .*raison et la date/);
});

test("refuse : une entrée admise qui n'appelle plus sendAndAwaitReceipt", () => {
  const source = "await this.mail.send({ template: 't' });";
  const { failures } = verdict([{ path: PATH, source }], { [PATH]: "raison" });
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /sender\.ts .*n'appelle plus mail\.sendAndAwaitReceipt.*retire-la de ADMITTED/,
  );
});

test("ignore : un commentaire qui cite sendAndAwaitReceipt(", () => {
  assert.deepEqual(
    callsIn(
      "/** appeler `sendAndAwaitReceipt()` après */\n// sendAndAwaitReceipt(x)\nconst a = 1;",
    ),
    [],
  );
  assert.deepEqual(
    verdict([{ path: PATH, source: "// this.mail.sendAndAwaitReceipt({})" }], {}).failures,
    [],
  );
});

test("ignore : les appels du bloc mail lui-même", () => {
  const path = "apps/lfd-api/src/mail/requests/application/check.ts";
  assert.deepEqual(verdict([{ path, source: CALLER }], {}).failures, []);
});

test("voit : un appel typé sendAndAwaitReceipt<K>(", () => {
  assert.deepEqual(callsIn("x.sendAndAwaitReceipt<'a'>({})"), [1]);
});

test("chaque entrée admise porte sa date et sa raison", () => {
  for (const reason of Object.values(ADMITTED)) assert.match(reason, /^2026-11-06, .+ — .+/);
});

test("compte : les appels admis, plusieurs par fichier", () => {
  const source = `${CALLER}\nthis.mail.sendAndAwaitReceipt({ template: "u" });`;
  assert.equal(verdict([{ path: PATH, source }], { [PATH]: "r" }).admittedCalls, 2);
});

test("lit : le modèle appelé, ou le dit illisible", () => {
  assert.deepEqual(callsIn(CALLER), [3]);
  assert.match(
    verdict([{ path: PATH, source: "m.sendAndAwaitReceipt(demand);" }], {}).failures[0],
    /modèle non lisible/,
  );
});

test("refuse : la porte injectée sous un autre nom que `mail`, en disant lequel", () => {
  const source = "class Y {\n  constructor(\n    private readonly mails: Mail,\n  ) {}\n}";
  const { failures } = verdict([{ path: PATH, source }], {});
  assert.equal(failures.length, 1);
  assert.match(failures[0], /sender\.ts:3 .*injectée sous le nom « mails ».*renomme-la `mail`/);
});

test("refuse : un nom faux même dans le bloc mail", () => {
  const path = "apps/lfd-api/src/mail/copy/x.ts";
  const source = "constructor(private readonly requests: Mail) {}";
  assert.equal(verdict([{ path, source }], {}).failures.length, 1);
});

test("admet : `mail: Mail`, et ignore les types voisins (MailDemand, Mail.x)", () => {
  assert.deepEqual(misnamedInjections("constructor(private readonly mail: Mail) {}"), []);
  assert.deepEqual(
    misnamedInjections("constructor(private readonly demand: MailDemand<K>) {}"),
    [],
  );
  assert.deepEqual(misnamedInjections("// private readonly mails: Mail"), []);
});

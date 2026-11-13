// node --test dev-toolbox/__tests__/mail-status-honest.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { DEBT, inScope, stageFields, verdict } from "../gates/mail-status-honest.mjs";

const PATH = "apps/lfd-api/src/lafoliecoffee/x/application/open.handler.ts";
const run = (source, debt = {}, path = PATH) => verdict([{ path, source }], debt).failures;

test("admet : un champ qui nomme l'étape acceptée, tiré du reçu", () => {
  assert.deepEqual(
    run("return { mailAccepted: isMailAccepted(await this.mail.sendAndAwaitReceipt(d)) };"),
    [],
  );
});

test("refuse sans dette : un champ tiré du réglage du mailer", () => {
  const failures = run("return { mailAccepted: this.config.mailerConfigured };", {});
  assert.equal(failures.length, 1);
  assert.match(failures[0], /open\.handler\.ts:1 .*mailAccepted.*réglage du mailer/);
});

test("refuse : un ancien nom tiré du réglage, même inscrit en dette", () => {
  const failures = run("const r = { mailSent: Boolean(apiKey) };", {
    [PATH]: { count: 1, reason: "r" },
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /réglage du mailer/);
});

test("refuse : une acceptation tirée de mail.send (la demande n'est qu'enregistrée)", () => {
  const failures = run("return { mailAccepted: (await this.mail.send(d)) !== null };");
  assert.match(failures[0], /mail\.send — la demande est enregistrée/);
});

test("refuse : une remise tirée de sendAndAwaitReceipt", () => {
  const failures = run(
    "return { mailDelivered: (await this.mail.sendAndAwaitReceipt(d)).providerId };",
  );
  assert.match(failures[0], /rien n'est remis/);
});

test("admet : une demande enregistrée nommée comme telle", () => {
  assert.deepEqual(run("return { mailRequested: (await this.mail.send(d)).requestId };"), []);
});

test("compte : un ancien nom hors dette échoue, en disant les noms d'étape", () => {
  const failures = run("export interface V { readonly mailSent: boolean; }");
  assert.equal(failures.length, 1);
  assert.match(failures[0], /1 champ\(s\) à l'ancien nom .* pour 0 admis/);
  assert.match(failures[0], /mailAccepted \(sendAndAwaitReceipt\)/);
});

test("dette : un compte égal passe, un compte qui baisse doit être abaissé", () => {
  const source = "interface V { readonly mailSent: boolean; readonly notified?: number }";
  assert.deepEqual(run(source, { [PATH]: { count: 2, reason: "r" } }), []);
  assert.match(
    run(source, { [PATH]: { count: 3, reason: "r" } })[0],
    /abaisse le compte dans DEBT/,
  );
});

test("dette : un fichier nettoyé qui reste inscrit échoue", () => {
  const failures = run("interface V { readonly mailAccepted: boolean }", {
    [PATH]: { count: 1, reason: "r" },
  });
  assert.match(failures[0], /n'a plus d'ancien nom .* retire-le de DEBT/);
});

test("ignore : un paramètre de constructeur et un commentaire", () => {
  assert.deepEqual(stageFields("constructor(private readonly sent: Reader) {}"), []);
  assert.deepEqual(stageFields("/** mailSent: true */\n// sent: 1"), []);
});

test("portée : contrats et couches servies, pas le domaine ni l'infrastructure ni les tests", () => {
  assert.equal(inScope("packages/contracts/src/x.ts"), true);
  assert.equal(inScope("apps/lfd-api/src/staff/invitations/open.ts"), true);
  assert.equal(inScope("apps/lfd-api/src/lafoliecoffee/x/domain/n.ts"), false);
  assert.equal(inScope("apps/lfd-api/src/lafoliecoffee/x/infrastructure/n.ts"), false);
  assert.equal(inScope("apps/lfd-api/src/lafoliecoffee/x/application/__tests__/n.ts"), false);
  assert.equal(inScope("apps/lfd-api/src/platform/database/client/models/V.ts"), false);
});

test("chaque entrée de dette porte son compte, sa date et sa raison", () => {
  for (const { count, reason } of Object.values(DEBT)) {
    assert.ok(Number.isInteger(count) && count > 0);
    assert.match(reason, /^\d{4}-\d{2}-\d{2} — .+/);
  }
});

// node --test dev-toolbox/__tests__/mail-key-no-pii.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { piiKeys, verdict } from "../gates/mail-key-no-pii.mjs";

const SENDER = (key) =>
  [
    "async go() {",
    "  await this.mail.send({",
    "    to: recipient.email,",
    `    idempotencyKey: ${key},`,
    "  });",
    "}",
  ].join("\n");

test("refuse : une clé qui interpole une adresse, avec sa ligne et le nom", () => {
  for (const [key, named] of [
    ["`invoice.notice:${invoice.id}:${recipient.email}`", "recipient.email"],
    ["`x:${to}`", "to"],
    ["`x:${recipient}`", "recipient"],
    ["`x:${owner.ownerEmail}`", "owner.ownerEmail"],
    ["keyOf(input.email)", "input.email"],
  ]) {
    const found = piiKeys(SENDER(key));
    assert.equal(found.length, 1, key);
    assert.equal(found[0].line, 4);
    assert.ok(found[0].named.includes(named), `${key} → ${found[0].named.join()}`);
  }
});

test("refuse : un « @ » littéral dans la clé", () => {
  assert.deepEqual(piiKeys(SENDER('"x:camille@halles.fr"'))[0].named, ["« @ » littéral"]);
});

test("admet : l'identifiant stable du destinataire, et le mot « mail » dans le texte", () => {
  assert.deepEqual(piiKeys(SENDER("`invoice.notice:${invoice.id}:${recipient.id}`")), []);
  assert.deepEqual(piiKeys(SENDER("`mail-copy.trial:${intentKey}`")), []);
  assert.deepEqual(piiKeys(SENDER('this.keyOf("access-opened", userId, input)')), []);
});

test("ignore : un fichier qui n'envoie pas d'e-mail, et les commentaires", () => {
  assert.deepEqual(piiKeys("const n = { idempotencyKey: `n:${to}` };"), []);
  assert.deepEqual(piiKeys(SENDER("`x:${id}` // ${to}")), []);
});

test("le verdict nomme le fichier, la ligne et la sortie", () => {
  const { failures } = verdict([{ path: "a.ts", source: SENDER("`x:${to}`") }]);
  assert.match(failures[0], /^a\.ts:4 .*construite avec une adresse \(to\).*identifiant stable/);
});

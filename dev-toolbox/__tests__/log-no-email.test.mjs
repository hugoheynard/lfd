import { test } from "node:test";
import assert from "node:assert/strict";

import { violationsIn } from "../gates/log-no-email.mjs";

test("refuse une adresse interpolée dans un journal", () => {
  const src = "this.logger.log(`Ouverture pour ${input.email}`);";
  assert.deepEqual(
    violationsIn(src).map((v) => v.snippet),
    ["input.email"],
  );
});

test("refuse un nom finissant par Email passé en argument", () => {
  assert.equal(violationsIn("console.warn('x', ownerEmail);").length, 1);
});

test("refuse `to` et `recipient`", () => {
  assert.equal(violationsIn("this.logger.error(`à ${to}`, e);").length, 1);
  assert.equal(violationsIn("this.logger.warn(`${recipient}`);").length, 1);
});

test("laisse passer un identifiant de compte", () => {
  assert.deepEqual(violationsIn("this.logger.log(`compte ${known.userId}`);"), []);
});

test("ignore le mot e-mail écrit dans le texte du message", () => {
  assert.deepEqual(violationsIn("this.logger.log(`email non envoyé à ${account.id}`);"), []);
});

test("ignore un appel de méthode nommé email()", () => {
  assert.deepEqual(violationsIn("this.logger.log(`${format.email()}`);").length, 1 - 1);
});

test("ignore un journal en commentaire", () => {
  assert.deepEqual(violationsIn("// this.logger.log(`${email}`);"), []);
});

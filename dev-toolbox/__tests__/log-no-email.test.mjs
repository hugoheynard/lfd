import { test } from "node:test";
import assert from "node:assert/strict";

import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { sourceRoots, violationsIn } from "../gates/log-no-email.mjs";

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

test("refuse une adresse dans le journal injecté d'un paquet (`this.log.info`)", () => {
  const src = 'this.log.info("E-mail à blanc", { template: "x", to: args.to });';
  assert.equal(violationsIn(src).length, 1);
});

test("laisse passer la clé d'idempotence dans le journal d'un paquet", () => {
  const src = 'this.log.info("E-mail envoyé", { idempotencyKey: args.idempotencyKey });';
  assert.deepEqual(violationsIn(src), []);
});

test("lit le src/ des paquets en plus de l'API", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const roots = sourceRoots(root).map((dir) => relative(root, dir));
  assert.ok(roots.includes("apps/lfd-api/src"));
  assert.ok(roots.includes("packages/mailer/src"));
});

// node --test dev-toolbox/__tests__/card-accounts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  accountDrift,
  checkAccounts,
  latestCheck,
  registryAccounts,
} from "../gates/card-accounts.mjs";

const REGISTRY = `
export const CARD_ACCOUNTS = [
  cardAccount({ name: "lfc-stripe", provider: "stripe", prefix: "STRIPE", env: {} }),
  cardAccount({ name: "lfc-caisse-epargne", provider: "lyra", prefix: "LYRA_CE", env: {} }),
] as const;
`;

test("lit les noms du registre, dans l'ordre", () => {
  assert.deepEqual(registryAccounts(REGISTRY), ["lfc-stripe", "lfc-caisse-epargne"]);
});

test("rend null sans tableau CARD_ACCOUNTS", () => {
  assert.equal(registryAccounts("export const OTHER = [];"), null);
});

test("lit le CHECK posé avec la table", () => {
  const sql = `CONSTRAINT "payment_account_known" CHECK ("account" IN ('lfc-stripe'))`;
  assert.deepEqual(checkAccounts(sql), ["lfc-stripe"]);
});

test("lit le DERNIER CHECK d'un fichier qui le repose par ADD CONSTRAINT", () => {
  const sql =
    `CONSTRAINT "payment_account_known" CHECK ("account" IN ('lfc-stripe'));\n` +
    `ALTER TABLE x DROP CONSTRAINT "payment_account_known";\n` +
    `ALTER TABLE x ADD CONSTRAINT "payment_account_known" CHECK ("account" IN ('lfc-stripe', 'lfc-caisse-epargne'));`;
  assert.deepEqual(checkAccounts(sql), ["lfc-stripe", "lfc-caisse-epargne"]);
});

test("rend null pour une migration qui ne pose pas le CHECK", () => {
  assert.equal(checkAccounts(`CREATE TABLE "x" ("id" TEXT);`), null);
});

test("égalité stricte : aucun écart", () => {
  assert.deepEqual(accountDrift(["lfc-stripe"], ["lfc-stripe"]), []);
});

test("un compte au registre absent du CHECK rougit", () => {
  const problems = accountDrift(["lfc-stripe", "lfc-caisse-epargne"], ["lfc-stripe"]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /lfc-caisse-epargne.*pas dans le CHECK/u);
});

test("un compte du CHECK absent du registre rougit (compte en base hors registre)", () => {
  const problems = accountDrift(["lfc-stripe"], ["lfc-stripe", "lfc-autre"]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /lfc-autre.*absent du registre/u);
});

test("un doublon au registre rougit", () => {
  assert.match(accountDrift(["lfc-stripe", "lfc-stripe"], ["lfc-stripe"])[0], /deux fois/u);
});

test("le dépôt d'aujourd'hui s'accorde", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const check = latestCheck(root);
  assert.notEqual(check, null);
  assert.deepEqual(check.accounts, ["lfc-stripe"]);
});

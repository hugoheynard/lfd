// node --test dev-toolbox/__tests__/company-archived-views.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { topLevelWhere, unnamedCalls, verdict } from "../gates/company-archived-views.mjs";

const at = (source) => unnamedCalls([{ path: "x.ts", source }]).unnamed.get("x.ts") ?? [];

test("admet : la colonne ou un prédicat nommé dans le where de premier niveau", () => {
  assert.deepEqual(at("this.prisma.company.findMany({ where: { archivedAt: null } })"), []);
  assert.deepEqual(
    at("prisma.company.count({ where: { status: 'active', archivedAt: { not: null } } })"),
    [],
  );
  assert.deepEqual(at("tx.company.findMany({ where: { ...openCompanyWhere() } })"), []);
  assert.deepEqual(at("p.company.findMany({ where: { ...inheritedSiteWhere(u) }, select })"), []);
});

test("refuse : sans where, ou un archivedAt qui parle d'une relation", () => {
  assert.equal(at("this.prisma.company.findMany({ select: { id: true } })").length, 1);
  assert.equal(
    at(
      "prisma.company.findMany({ where: { id: { in: ids } }, select: { addresses: { where: { archivedAt: null } } } })",
    ).length,
    1,
  );
  assert.equal(at("prisma.company.count()").length, 1);
});

test("le where de premier niveau s'arrête à sa virgule", () => {
  assert.equal(topLevelWhere("({ where: { a: 1 }, select: { b: 2 } })").trim(), "{ a: 1 }");
  assert.equal(topLevelWhere("({ select: { x: { where: { archivedAt: null } } } })"), "");
});

test("un appel hors liste échoue, un compte qui baisse aussi", () => {
  const unnamed = new Map([["a.ts", ["a.ts:3  (findMany)"]]]);
  assert.equal(verdict(unnamed, new Map()).length, 1);
  assert.deepEqual(verdict(unnamed, new Map([["a.ts", { calls: 1, reason: "r" }]])), []);
  assert.equal(verdict(new Map(), new Map([["a.ts", { calls: 1, reason: "r" }]])).length, 1);
});

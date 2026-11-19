// node --test dev-toolbox/__tests__/pim-table-owners.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { analyse, callsOf, verdict } from "../gates/pim-table-owners.mjs";

const run = (files, declared) =>
  analyse(
    Object.entries(files).map(([path, source]) => ({ path, source })),
    declared,
  );

test("appels : modèle et opération, commentaires ignorés", () => {
  const source =
    "await this.prisma.product.count({});\n// this.prisma.vatRate.findMany()\ntx.category.update({})";
  assert.deepEqual(callsOf(source), [
    { model: "product", operation: "count" },
    { model: "category", operation: "update" },
  ]);
});

test("le propriétaire lit ses tables ; un voisin qui les lit viole", () => {
  const found = run({
    "catalogue/product/infrastructure/w.ts": "this.prisma.product.update({})",
    "catalogue/product/infrastructure/r.ts": "this.prisma.product.findMany({})",
    "catalogue/category/infrastructure/c.ts":
      "this.prisma.product.count({}); this.prisma.product.groupBy({})",
  });
  assert.deepEqual(Object.fromEntries(found.violations), {
    "catalogue/category/infrastructure/c.ts → product": 2,
  });
  assert.match(verdict(found, {}).join("\n"), /écrite par catalogue\/product/u);
});

test("tests et racine exemptés ; un modèle sans écrivain se tait, sauf propriétaire déclaré", () => {
  const files = {
    "catalogue/category/__tests__/x.spec.ts":
      "this.prisma.product.update({}); this.prisma.vatRate.findMany({})",
    "pim.module.ts": "this.prisma.vatRate.findMany({})",
    "catalogue/category/infrastructure/c.ts": "this.prisma.productVariant.findMany({})",
  };
  assert.equal(run(files).violations.size, 0);
  assert.equal(run(files, { productVariant: ["catalogue/product"] }).violations.size, 1);
});

test("dette : un compte qui baisse doit être baissé", () => {
  const found = run({
    "catalogue/product/w.ts": "prisma.product.create({})",
    "catalogue/category/c.ts": "prisma.product.count({})",
  });
  assert.deepEqual(verdict(found, { reads: { "catalogue/category/c.ts → product": 1 } }), []);
  assert.match(
    verdict(found, { reads: { "catalogue/category/c.ts → product": 2 } }).join("\n"),
    /baisse le compte/u,
  );
});

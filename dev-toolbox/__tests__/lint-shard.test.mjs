import assert from "node:assert/strict";
import { test } from "node:test";

import { lintedFiles, shardOf } from "../ci/lint-shard.mjs";

test("chaque fichier linté va dans exactement un morceau", () => {
  const files = lintedFiles();
  const total = 3;
  const seen = [1, 2, 3].flatMap((index) => shardOf(files, index, total));
  assert.equal(seen.length, files.length);
  assert.deepEqual([...seen].sort(), files);
});

test("le périmètre est celui de lint:ci, sans les clients Prisma générés", () => {
  const files = lintedFiles();
  assert.ok(files.length > 1000, `trop peu de fichiers : ${files.length}`);
  assert.ok(files.every((path) => /^(src|test|container\/__tests__)\//.test(path)));
  assert.ok(files.every((path) => path.endsWith(".ts")));
  assert.ok(!files.some((path) => path.includes("/database/client/")));
});

test("les morceaux sont équilibrés à un fichier près", () => {
  const files = lintedFiles();
  const sizes = [1, 2, 3].map((index) => shardOf(files, index, 3).length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `tailles : ${sizes.join(", ")}`);
});

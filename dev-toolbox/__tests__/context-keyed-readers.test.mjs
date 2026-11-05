// node --test dev-toolbox/__tests__/context-keyed-readers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { verdict, violationsIn } from "../gates/context-keyed-readers.mjs";

const READER = [
  "import { ClientWorkspace } from './client-workspace.service';",
  "export class X { private readonly workspace = inject(ClientWorkspace); }",
].join("\n");

test("refuse : ClientWorkspace cité dans le code", () => {
  assert.equal(violationsIn(READER).length, 2);
});

test("refuse : une clé maison déclarée", () => {
  for (const name of ["readFor", "loadedFor", "photoFor"]) {
    const source = `class X {\n  private ${name}: string | null = null;\n}\n`;
    assert.equal(violationsIn(source).length, 1, name);
  }
});

test("refuse : workspaceHeadersOf hors de la brique, l'admet dedans", () => {
  const source = "const h = workspaceHeadersOf(key);\n";
  const brick = "apps/lfc-ecommerce-frontend/src/app/client/context-keyed/context-keyed.ts";
  assert.equal(violationsIn(source, "a.ts").length, 1);
  assert.equal(violationsIn(source, brick).length, 0);
});

test("admet un commentaire qui cite l'ancienne mécanique, et une simple lecture", () => {
  const source =
    "// c'est `ClientWorkspace` qui sait\n/* readFor = x */\nif (this.keyed.readFor) {}\n";
  assert.deepEqual(violationsIn(source), []);
});

test("dette : un fichier inscrit passe et se compte", () => {
  const { failures, remaining } = verdict([{ path: "a.ts", source: READER }], ["a.ts"]);
  assert.deepEqual(failures, []);
  assert.deepEqual(remaining, [["a.ts", 2]]);
});

test("dette : un fichier hors liste qui en gagne une échoue", () => {
  assert.ok(verdict([{ path: "b.ts", source: READER }], []).failures.length > 0);
});

test("dette : un fichier inscrit devenu propre échoue", () => {
  const { failures } = verdict([{ path: "a.ts", source: "const x = 1;\n" }], ["a.ts"]);
  assert.match(failures[0] ?? "", /propre/u);
});

test("admis : un fichier ou un dossier de la liste admise ne compte pas", () => {
  const files = [
    { path: "guard.ts", source: READER },
    { path: "reload/x.ts", source: READER },
  ];
  const { failures, remaining } = verdict(files, [], { "guard.ts": "r", "reload/": "r" });
  assert.deepEqual(failures, []);
  assert.deepEqual(remaining, []);
});

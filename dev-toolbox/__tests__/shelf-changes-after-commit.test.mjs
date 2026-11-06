// node --test dev-toolbox/__tests__/shelf-changes-after-commit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFERRED, verdict, violationsIn } from "../gates/shelf-changes-after-commit.mjs";

const WRITER = "apps/lfd-api/src/b2b/x/infrastructure/prisma-x.repository.ts";

const DEFERRED_SOURCE = [
  'import { AfterCommit } from "../../../../platform/database/after-commit.js";',
  "export class DeferredShelfChanges extends ShelfChanges {",
  "  changed(scope) {",
  "    this.afterCommit.defer(() => this.window.record(scope), 'shelf.changed');",
  "  }",
  "}",
].join("\n");

/** Un dépôt : constructeur, puis une méthode au corps donné (indentation Prettier). */
function writer(body) {
  return [
    "export class PrismaX {",
    "  constructor(",
    "    private readonly prisma: PrismaService,",
    "    private readonly shelves: ShelfChanges,",
    "  ) {}",
    "",
    "  async save(x: X): Promise<void> {",
    ...body.map((line) => `    ${line}`),
    "  }",
    "",
    "  async other(): Promise<void> {",
    "    await this.prisma.y.update({ where: {}, data: {} });",
    "  }",
    "}",
  ].join("\n");
}

test("admet : le signal APRÈS l'écriture", () => {
  const source = writer([
    "await this.prisma.x.update({ where: {}, data: {} });",
    "this.shelves.changed(ALL);",
  ]);
  assert.deepEqual(violationsIn(source, WRITER), []);
});

test("refuse : le signal AVANT l'écriture de la même fonction", () => {
  const source = writer([
    "this.shelves.changed(ALL);",
    "await this.prisma.x.update({ where: {}, data: {} });",
  ]);
  assert.equal(violationsIn(source, WRITER).length, 1);
});

test("refuse : le signal avant une écriture en SQL brut, ou avant l'unité de travail", () => {
  for (const write of [
    "await this.prisma.$executeRaw`UPDATE x`;",
    "await this.uow.run(async () => {});",
  ]) {
    const source = writer(["this.shelves.changed(ALL);", write]);
    assert.equal(violationsIn(source, WRITER).length, 1, write);
  }
});

test("admet : une écriture d'une AUTRE méthode, après celle qui émet", () => {
  const source = writer([
    "await this.prisma.x.create({ data: {} });",
    "if (ok) {",
    "  this.shelves.changed(ALL);",
    "}",
  ]);
  assert.deepEqual(violationsIn(source, WRITER), []);
});

test("admet : un bloc qui émet puis sort, suivi d'une écriture qu'il n'atteint pas", () => {
  const source = writer([
    "const updated = await this.prisma.$executeRaw`UPDATE x`;",
    "if (updated > 0) {",
    "  this.shelves.changed(ALL);",
    "  return true;",
    "}",
    "await this.prisma.$executeRaw`INSERT INTO x`;",
    "this.shelves.changed(ALL);",
  ]);
  assert.deepEqual(violationsIn(source, WRITER), []);
});

test("admet : un commentaire qui raconte un signal avant l'écriture", () => {
  const source = writer([
    "// this.shelves.changed(ALL); puis await this.prisma.x.update()",
    "await this.prisma.x.update({ where: {}, data: {} });",
    "this.shelves.changed(ALL);",
  ]);
  assert.deepEqual(violationsIn(source, WRITER), []);
});

test("refuse : une seconde implémentation du port", () => {
  const source = "export class ImmediateShelfChanges extends ShelfChanges { changed() {} }";
  assert.equal(violationsIn(source, WRITER).length, 1);
  assert.deepEqual(violationsIn(DEFERRED_SOURCE, DEFERRED), []);
});

test("refuse : le port lié à autre chose que DeferredShelfChanges", () => {
  const bad = "providers: [{ provide: ShelfChanges, useValue: { changed: () => {} } }]";
  const good = "providers: [{ provide: ShelfChanges, useClass: DeferredShelfChanges }]";
  assert.equal(violationsIn(bad, "a.ts").length, 1);
  assert.deepEqual(violationsIn(good, "a.ts"), []);
});

test("refuse : un écrivain qui atteint la fenêtre ou la purge ; la plomberie l'admet", () => {
  const source =
    'import { ShelfPurge } from "../../shared/shelf-changes/domain/ports/shelf-purge.js";\n';
  assert.equal(violationsIn(source, WRITER).length, 1);
  const window = 'import { ShelfChangeWindow } from "./shelf-change-window.js";\n';
  assert.deepEqual(
    violationsIn(
      window,
      "apps/lfd-api/src/b2b/shared/shelf-changes/application/deferred-shelf-changes.ts",
    ),
    [],
  );
});

test("verdict : la file d'après validation retirée de DeferredShelfChanges échoue", () => {
  const hollow =
    "export class DeferredShelfChanges extends ShelfChanges { changed(s) { this.window.record(s); } }";
  const { failures } = verdict([{ path: DEFERRED, source: hollow }]);
  assert.match(failures[0] ?? "", /AfterCommit/u);
});

test("verdict : sans DeferredShelfChanges, la porte refuse de conclure", () => {
  assert.ok(verdict([]).failures.length > 0);
});

test("verdict : un dépôt sain passe et se compte", () => {
  const source = writer([
    "await this.prisma.x.update({ where: {}, data: {} });",
    "this.shelves.changed(ALL);",
  ]);
  const { failures, emitters } = verdict([
    { path: DEFERRED, source: DEFERRED_SOURCE },
    { path: WRITER, source },
  ]);
  assert.deepEqual(failures, []);
  assert.equal(emitters, 1);
});

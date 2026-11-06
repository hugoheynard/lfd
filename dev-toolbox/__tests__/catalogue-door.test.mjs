// node --test dev-toolbox/__tests__/catalogue-door.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { snapshotReadsOf, verdict } from "../gates/catalogue-door.mjs";

const LOADER = "b2b/catalog/infrastructure/catalogue-snapshot/catalogue-snapshot.loader.ts";
const LOADER_SOURCE = "await prisma.catalogItem.findMany({ select: S });";
const FALLBACK = "b2b/catalog/infrastructure/prisma-x.reader.ts";
const FALLBACK_SOURCE = "return this.prisma.catalogOperation.findMany({});";
const WRAPPER = "b2b/catalog/infrastructure/catalogue-snapshot/snapshot-x.reader.ts";
const WRAPPER_SOURCE = 'import { PrismaXReader } from "../prisma-x.reader.js";';

/** Le dépôt minimal : le chargeur, un repli enveloppé, un admis. */
function files(extra = []) {
  return [
    { path: LOADER, source: LOADER_SOURCE },
    { path: FALLBACK, source: FALLBACK_SOURCE },
    { path: WRAPPER, source: WRAPPER_SOURCE },
    { path: "b2b/admin.reader.ts", source: "this.prisma.catalogItem.count({});" },
    ...extra,
  ];
}

const LISTS = {
  loader: LOADER,
  fallbacks: { [FALLBACK]: "r" },
  admitted: { "b2b/admin.reader.ts": "administration", "dev/": "semis" },
};

test("lit les modèles, multi-lignes compris, et le SQL brut", () => {
  assert.deepEqual(snapshotReadsOf("this.prisma.catalogItem\n  .findMany({})"), ["catalog_items"]);
  assert.deepEqual(snapshotReadsOf('SELECT 1 FROM public."order_cutoffs" o'), ["order_cutoffs"]);
  assert.deepEqual(snapshotReadsOf("x JOIN catalog_item_overrides o ON"), [
    "catalog_item_overrides",
  ]);
});

test("ignore une écriture, et un commentaire qui raconte une lecture", () => {
  assert.deepEqual(snapshotReadsOf("await this.prisma.catalogItem.update({})"), []);
  assert.deepEqual(
    snapshotReadsOf("// this.prisma.catalogItem.findMany()\n/* FROM catalog_items */"),
    [],
  );
});

test("un dépôt classé passe", () => {
  assert.deepEqual(verdict(files(), LISTS).failures, []);
});

test("refuse : un lecteur neuf, non classé, sur une table de l'instantané", () => {
  const extra = [
    { path: "b2b/orders/new.reader.ts", source: "this.prisma.catalogItem.findMany({});" },
  ];
  const { failures } = verdict(files(extra), LISTS);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /new\.reader\.ts.*catalog_items/u);
});

test("admet un dossier de la liste (le semis)", () => {
  const extra = [{ path: "dev/seeding/x.seed.ts", source: "prisma.orderCutoff.findFirst({});" }];
  assert.deepEqual(verdict(files(extra), LISTS).failures, []);
});

test("refuse : un repli que plus aucun adaptateur de l'instantané n'enveloppe", () => {
  const unwrapped = files().filter((file) => file.path !== WRAPPER);
  const { failures } = verdict(unwrapped, LISTS);
  assert.match(failures.join("\n"), /enveloppe/u);
});

test("refuse : une entrée qui ne lit plus rien (repli comme admis)", () => {
  const silent = files().map((file) =>
    file.path === FALLBACK || file.path === "b2b/admin.reader.ts" ? { ...file, source: "" } : file,
  );
  const { failures } = verdict(silent, LISTS);
  assert.equal(failures.filter((failure) => /ne lit plus rien/u.test(failure)).length, 2);
});

test("refuse : un chargeur qui ne lit plus rien", () => {
  const empty = files().map((file) => (file.path === LOADER ? { ...file, source: "" } : file));
  assert.match(verdict(empty, LISTS).failures.join("\n"), /chargeur/u);
});

// node --test dev-toolbox/__tests__/lint-runner.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  commandOf,
  countMismatch,
  gatesTouchedBy,
  globToRegExp,
  loadGates,
  loadTools,
  malformedGates,
  summary,
} from "../../lint/lib/catalogue.mjs";
import { ignoredPath } from "../../lint/lib/watch.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const gate = (name, watch, script = `dev-toolbox/gates/${name}.mjs`) => ({
  name,
  script,
  holds: "Une phrase qui dit ce que la porte tient.",
  since: "2026-11-06",
  watch,
});

test("le catalogue réel est complet : chaque porte a nom, script, holds, since, watch", () => {
  assert.deepEqual(malformedGates(loadGates(ROOT)), []);
});

test("le catalogue réel : chaque outil a un nom, une commande et une phrase", () => {
  for (const tool of loadTools(ROOT)) {
    assert.ok(tool.name && tool.run && tool.does, JSON.stringify(tool));
  }
});

test("refuse : un nom préfixé, un doublon, ni script ni commande, une date absente", () => {
  const problems = malformedGates([
    { ...gate("lint:a", ["x"]) },
    gate("b", ["x"]),
    gate("b", ["x"]),
    { name: "c", holds: "Une phrase suffisante.", since: "hier", watch: [] },
  ]);
  assert.ok(problems.some((p) => /lint:a.*sans « lint: »/.test(p)));
  assert.ok(problems.some((p) => /› b : nom en double/.test(p)));
  assert.ok(problems.some((p) => /› c : il faut `script`/.test(p)));
  assert.ok(problems.some((p) => /› c : `since`/.test(p)));
  assert.ok(problems.some((p) => /› c : `watch`/.test(p)));
});

test("le compte de CLAUDE.md : concorde, diffère, ou a disparu", () => {
  const text = "pnpm lint:gates         # les 62 portes du dépôt, toutes";
  assert.equal(countMismatch(text, 62), null);
  assert.match(
    countMismatch(text, 63) ?? "",
    /annonce 62 portes, .* en liste 63.*corrige le compte en 63/,
  );
  assert.match(countMismatch("rien", 3) ?? "", /ne dit plus « les N portes du dépôt »/);
});

test("le compte réel de CLAUDE.md égale la liste", async () => {
  const { readFileSync } = await import("node:fs");
  assert.equal(
    countMismatch(readFileSync(`${ROOT}/CLAUDE.md`, "utf8"), loadGates(ROOT).length),
    null,
  );
});

test("les motifs : ** traverse, * s'arrête au dossier", () => {
  assert.ok(globToRegExp("apps/lfd-api/src/**").test("apps/lfd-api/src/mail/a.ts"));
  assert.ok(globToRegExp("**/*.md").test("README.md"));
  assert.ok(globToRegExp("**/*.md").test("docs/x/y.md"));
  assert.ok(globToRegExp("apps/*/package.json").test("apps/lfd-api/package.json"));
  assert.ok(!globToRegExp("apps/*/package.json").test("apps/lfd-api/x/package.json"));
  assert.ok(!globToRegExp("apps/lfd-api/src/**").test("apps/lfd-api/test/a.ts"));
  assert.ok(globToRegExp("**").test("n/importe/quoi.txt"));
});

test("relance : la porte dont un motif est touché, son propre fichier, et toutes pour une brique partagée", () => {
  const gates = [gate("a", ["apps/lfd-api/src/**"]), gate("b", ["documentation/**"])];
  assert.deepEqual(
    gatesTouchedBy(["apps/lfd-api/src/x.ts"], gates).map((g) => g.name),
    ["a"],
  );
  assert.deepEqual(
    gatesTouchedBy(["dev-toolbox/gates/b.mjs"], gates).map((g) => g.name),
    ["b"],
  );
  assert.deepEqual(
    gatesTouchedBy(["dev-toolbox/gates/lib/prisma-schema.mjs"], gates).map((g) => g.name),
    ["a", "b"],
  );
  assert.deepEqual(gatesTouchedBy(["packages/x.ts"], gates), []);
});

test("la commande : node + script, ou la commande écrite", () => {
  assert.deepEqual(commandOf(gate("a", ["x"])), ["node", "dev-toolbox/gates/a.mjs"]);
  assert.deepEqual(commandOf({ name: "s", command: ["pnpm", "x"] }), ["pnpm", "x"]);
});

test("le résumé nomme les rouges et dit comment les relancer", () => {
  const text = summary([
    { name: "a", ok: true },
    { name: "b", ok: false },
  ]);
  assert.match(text, /1\/2 vertes, 1 rouge\(s\)/);
  assert.match(text, /✗ b {2}— relancer : pnpm gate b/);
  assert.match(summary([{ name: "a", ok: true }]), /1\/1 vertes\./);
});

test("la veille ignore node_modules, .git, dist et le client Prisma généré", () => {
  assert.ok(ignoredPath("node_modules/x/index.js"));
  assert.ok(ignoredPath("apps/lfd-api/node_modules/x"));
  assert.ok(ignoredPath(".git/index"));
  assert.ok(ignoredPath("packages/money/dist/index.js"));
  assert.ok(ignoredPath("apps/lfd-api/src/platform/database/client/client.ts"));
  assert.ok(!ignoredPath("apps/lfd-api/src/mail/mail.module.ts"));
});

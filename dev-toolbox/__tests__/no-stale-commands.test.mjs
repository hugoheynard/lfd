// node --test dev-toolbox/__tests__/no-stale-commands.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { RENAMED, retiredCommands, staleCitations } from "../gates/no-stale-commands.mjs";

const SCRIPTS = { "lint:gates": "x", "lint:watch": "x", gate: "x", tool: "x", "dev:infra": "x" };
const GATES = [{ name: "clock-port" }, { name: "mermaid" }];
const TOOLS = [{ name: "copy:digest" }, { name: "dev:infra:nuke" }];
const RETIRED = retiredCommands(SCRIPTS, GATES, TOOLS);

test("retirées : les portes en lint:, les outils, les renommages — pas ce qui reste au package.json", () => {
  assert.equal(RETIRED.get("lint:clock-port"), "pnpm gate clock-port");
  assert.equal(RETIRED.get("copy:digest"), "pnpm tool copy:digest");
  assert.equal(RETIRED.get("lint:send-now-admitted"), RENAMED["lint:send-now-admitted"]);
  assert.equal(RETIRED.has("lint:gates"), false);
  assert.equal(RETIRED.has("dev:infra"), false);
});

test("refuse : une citation retirée, avec sa ligne et sa remplaçante", () => {
  const found = staleCitations("a\n        run: pnpm lint:clock-port\n", RETIRED);
  assert.deepEqual(found, [
    { line: 2, command: "lint:clock-port", replacement: "pnpm gate clock-port" },
  ]);
});

test("refuse : la forme `pnpm run`, et un outil", () => {
  assert.equal(staleCitations("pnpm run copy:digest", RETIRED).length, 1);
  assert.equal(staleCitations("`pnpm dev:infra:nuke`", RETIRED)[0]?.command, "dev:infra:nuke");
});

test("admet : les commandes restantes et les nouvelles formes", () => {
  const text =
    "pnpm lint:gates\npnpm gate clock-port\npnpm tool copy:digest\npnpm dev:infra\npnpm --filter lfd-api lint";
  assert.deepEqual(staleCitations(text, RETIRED), []);
});

test("ne confond pas un préfixe : dev:infra n'est pas dev:infra:nuke", () => {
  assert.deepEqual(staleCitations("pnpm dev:infra:down", RETIRED), []);
  assert.equal(staleCitations("pnpm dev:infra:nuke.", RETIRED).length, 1);
});

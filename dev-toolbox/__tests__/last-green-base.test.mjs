// node --test dev-toolbox/__tests__/last-green-base.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { chooseBase } from "../ci/last-green-base.mjs";

const ancestorsOf =
  (...shas) =>
  (sha) =>
    shas.includes(sha);

test("prend le run vert le plus récent qui est un ancêtre de HEAD", () => {
  assert.equal(chooseBase(["c", "b", "a"], "head", ancestorsOf("b", "a")), "b");
});

/**
 * Régression : le 2026-11-10, trois pushes rapprochés ont annulé les runs du
 * milieu ; comparer au push précédent sautait des commits jamais vérifiés. Le
 * dernier VERT, lui, est plus loin, et c'est à lui qu'on compare.
 */
test("saute les commits poussés dont le run a été annulé : ils ne sont pas dans la liste des verts", () => {
  const greens = ["a9d5a3985"];
  assert.equal(chooseBase(greens, "125c1be9", ancestorsOf("a9d5a3985", "3cbd8cfa7")), "a9d5a3985");
});

test("ignore HEAD lui-même (un run vert rejoué sur le même commit)", () => {
  assert.equal(chooseBase(["head", "a"], "head", ancestorsOf("head", "a")), "a");
});

test("ignore un run vert qui n'est pas un ancêtre (force-push, autre histoire)", () => {
  assert.equal(chooseBase(["x", "a"], "head", ancestorsOf("a")), "a");
});

test("rend une base vide quand aucun vert n'est ancêtre : tout se lance", () => {
  assert.equal(chooseBase(["x", "y"], "head", ancestorsOf()), "");
});

test("rend une base vide sans aucun run vert", () => {
  assert.equal(chooseBase([], "head", ancestorsOf("a")), "");
});

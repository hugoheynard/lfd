// node --test dev-toolbox/__tests__/worktrees-clean.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { IDLE_MS, keepReason, parseWorktrees } from "../worktrees-clean.mjs";

const NOW = 10 * IDLE_MS;

/** Une copie qui ne peut rien perdre : seule cette forme est retirée. */
const SAFE = {
  underAgentDir: true,
  locked: false,
  dirtyLines: 0,
  uniqueCommits: 0,
  base: "dev",
  lastTouchMs: NOW - IDLE_MS - 1,
};

test("retire une copie propre, fusionnée et oubliée depuis un jour", () => {
  assert.equal(keepReason(SAFE, NOW), null);
});

test("garde une copie hors de .claude/worktrees", () => {
  assert.match(keepReason({ ...SAFE, underAgentDir: false }, NOW), /hors de/);
});

test("garde une copie verrouillée", () => {
  assert.match(keepReason({ ...SAFE, locked: true }, NOW), /verrouillée/);
});

test("garde une copie qui a un fichier non commité", () => {
  assert.match(keepReason({ ...SAFE, dirtyLines: 1 }, NOW), /non commité/);
});

/**
 * Régression évitée (2026-11-08) : deux copies portaient des corrections
 * jamais fusionnées ; les retirer avec la branche les aurait perdues.
 */
test("garde une copie dont un commit n'est pas dans la référence", () => {
  assert.match(keepReason({ ...SAFE, uniqueCommits: 1 }, NOW), /absent\(s\) de dev/);
});

test("garde une copie touchée il y a moins de 24 h (un agent y travaille peut-être)", () => {
  assert.match(keepReason({ ...SAFE, lastTouchMs: NOW - IDLE_MS + 1 }, NOW), /24 h/);
});

test("lit la liste porcelain de git, verrou compris", () => {
  const porcelain = [
    "worktree /r\nHEAD aaa\nbranch refs/heads/dev",
    "worktree /r/.claude/worktrees/a\nHEAD bbb\nbranch refs/heads/x\nlocked",
    "worktree /r/.claude/worktrees/b\nHEAD ccc\ndetached",
  ].join("\n\n");
  assert.deepEqual(parseWorktrees(porcelain), [
    { path: "/r", locked: false },
    { path: "/r/.claude/worktrees/a", locked: true },
    { path: "/r/.claude/worktrees/b", locked: false },
  ]);
});

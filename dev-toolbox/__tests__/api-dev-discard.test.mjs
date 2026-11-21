import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { discardDir } from "../api-dev-policy.mjs";

/**
 * Régression : l'API de dev ne démarrait pas — `rmdir dist/...` levait
 * ENOTEMPTY quand un `tsc` d'une pile précédente écrivait encore dans `dist`.
 */
test("écarte le dist d'un coup : le chemin est libre aussitôt, même si l'on écrit encore dans l'ancien", () => {
  const root = mkdtempSync(join(tmpdir(), "api-dev-"));
  const dist = join(root, "dist");
  mkdirSync(join(dist, "lafoliecoffee", "accounting"), { recursive: true });
  writeFileSync(join(dist, "main.js"), "");

  const parked = discardDir(dist, join(root, "trash"), fs, "un");

  assert.equal(existsSync(dist), false);
  assert.equal(parked, join(root, "trash", "un"));
  // L'écrivain en retard écrit dans le dossier rangé, sans gêner le nouveau dist.
  writeFileSync(join(root, "trash", "un", "lafoliecoffee", "accounting", "late.js"), "");
  mkdirSync(dist);
  assert.equal(existsSync(dist), true);
});

test("ne fait rien quand le dist n'existe pas", () => {
  const root = mkdtempSync(join(tmpdir(), "api-dev-"));
  assert.equal(discardDir(join(root, "dist"), join(root, "trash"), fs, "un"), null);
});

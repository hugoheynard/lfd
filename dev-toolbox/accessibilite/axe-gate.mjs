#!/usr/bin/env node
/**
 * **La porte axe de la boutique** — `pnpm a11y:axe` ; `pnpm a11y:baseline`
 * (`--update`) régénère la référence. Doc : documentation/accessibilite/porte-axe.md.
 *
 * 1. Lance les scènes Playwright de l'aperçu (`apps/lfc-ecommerce-frontend/a11y/`),
 *    qui écrivent leurs violations dans `tmp/axe-results/`.
 * 2. Compare les comptes à `axe-baseline.json` : une violation nouvelle ou un
 *    compte qui monte échoue ; un compte qui baisse échoue AUSSI, tant que la
 *    référence n'est pas régénérée — la dette ne peut que décroître, et ce
 *    qu'on a remboursé ne doit pas pouvoir revenir en silence.
 *
 * Une scène qui échoue (aperçu qui ne démarre pas, geste introuvable) fait
 * échouer la porte avant toute comparaison : une page non mesurée n'est pas
 * une page propre.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareAxe, sortedBaseline } from "./axe-baseline-compare.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APP = resolve(ROOT, "apps/lfc-ecommerce-frontend");
const RESULTS = resolve(APP, "tmp/axe-results");
const BASELINE = resolve(ROOT, "dev-toolbox/accessibilite/axe-baseline.json");
const update = process.argv.includes("--update");

rmSync(RESULTS, { recursive: true, force: true });
mkdirSync(RESULTS, { recursive: true });
const started = Date.now();
const run = spawnSync("pnpm", ["exec", "playwright", "test"], { cwd: APP, stdio: "inherit" });
const seconds = Math.round((Date.now() - started) / 1000);
if (run.status !== 0) {
  console.error(`\n✗ a11y:axe — une scène n'a pas pu être mesurée (${seconds} s). Rien n'est comparé.`);
  process.exit(1);
}

const measured = {};
for (const file of readdirSync(RESULTS).filter((f) => f.endsWith(".json"))) {
  const { page, counts } = JSON.parse(readFileSync(resolve(RESULTS, file), "utf8"));
  measured[page] = counts;
}

if (update) {
  writeFileSync(BASELINE, `${JSON.stringify(sortedBaseline(measured), null, 2)}\n`);
  const total = Object.values(measured).reduce(
    (n, counts) => n + Object.values(counts).reduce((a, b) => a + b, 0),
    0,
  );
  console.log(`\n✓ a11y:baseline — ${Object.keys(measured).length} pages, ${total} nœud(s) en violation inscrits (${seconds} s).`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const { regressions, repaid, missingPages, newPages } = compareAxe(baseline, measured);
const fix = "→ corriger, ou, si c'est voulu, `pnpm a11y:baseline` et committer la référence.";
const report = [
  [regressions, "Violations nouvelles ou en hausse", "→ corriger la régression. La référence ne s'élargit pas."],
  [repaid, "Dette remboursée mais encore inscrite", "→ `pnpm a11y:baseline` et committer la référence : elle ne descendra plus."],
  [missingPages, "Pages inscrites et non mesurées", fix],
  [newPages, "Pages mesurées et non inscrites", fix],
];
let failed = false;
for (const [items, title, hint] of report) {
  if (items.length === 0) continue;
  failed = true;
  console.error(`\n✗ ${title} (${items.length}) :`);
  for (const item of items) console.error(`  · ${item}`);
  console.error(`  ${hint}`);
}
if (failed) process.exit(1);
console.log(`\n✓ a11y:axe — ${Object.keys(measured).length} pages conformes à la référence (${seconds} s).`);

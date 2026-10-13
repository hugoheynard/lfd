#!/usr/bin/env node
/**
 * Résume ce que coûte le démarrage et l'arrêt de l'application e2e, par fichier.
 *
 * Lit un ou plusieurs JSONL écrits par `apps/lfd-api/test/e2e-boot-log.ts` (une
 * ligne par fichier e2e) et imprime : nombre de fichiers, somme et médiane de
 * `bootMs` et `closeMs`, les phases du démarrage, le top 10, et la part de
 * l'éclat. Posé le 2026-10-13 pour décider s'il vaut la peine de partager une
 * application entre fichiers.
 *
 * Usage :
 *   node dev-toolbox/ci/e2e-boot-summary.mjs [--wall <s>] [--workers <n>] <fichier.jsonl|dossier>…
 *
 * Un dossier est parcouru récursivement (les artefacts de `gh run download`).
 * `--wall` est la durée murale de l'étape de tests, en secondes ; `--workers`
 * le nombre de workers Jest qui se la partagent. Sans `--wall`, pas de part.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
let wallSeconds;
let workers = 1;
const inputs = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--wall") wallSeconds = Number(args[(i += 1)]);
  else if (args[i] === "--workers") workers = Number(args[(i += 1)]);
  else inputs.push(args[i]);
}

function jsonlFiles(path) {
  if (!statSync(path, { throwIfNoEntry: false })) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => jsonlFiles(join(path, name)));
}

const rows = inputs
  .flatMap(jsonlFiles)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  );

if (rows.length === 0) {
  console.log("Aucune mesure de démarrage e2e (E2E_BOOT_LOG vide ou absent).");
  process.exit(0);
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const s = (ms) => `${(ms / 1000).toFixed(1)} s`;

const boot = rows.map((r) => r.bootMs);
const close = rows.map((r) => r.closeMs);
const reset = rows.map((r) => r.resetMs ?? 0);
const total = sum(boot) + sum(close);

console.log(`Fichiers e2e mesurés : ${rows.length}`);
console.log(
  `Démarrage : somme ${s(sum(boot))}, médiane ${median(boot)} ms, moyenne ${Math.round(sum(boot) / rows.length)} ms`,
);
console.log(
  `Arrêt     : somme ${s(sum(close))}, médiane ${median(close)} ms, moyenne ${Math.round(sum(close) / rows.length)} ms`,
);
console.log(
  `Remises à zéro (pour mémoire) : somme ${s(sum(reset))}, ${sum(rows.map((r) => r.resetCount ?? 0))} appels`,
);
for (const phase of ["compile", "init", "dbReady", "listen"]) {
  const xs = rows.map((r) => r.phases?.[phase] ?? 0);
  console.log(`  phase ${phase.padEnd(8)} : somme ${s(sum(xs))}, médiane ${median(xs)} ms`);
}
if (wallSeconds !== undefined && Number.isFinite(wallSeconds) && wallSeconds > 0) {
  const budget = wallSeconds * 1000 * workers;
  console.log(
    `Part du temps de l'éclat : ${((100 * total) / budget).toFixed(1)} % ` +
      `(${s(total)} sur ${wallSeconds} s × ${workers} worker(s))`,
  );
}
console.log("\nTop 10 (démarrage + arrêt) :");
for (const r of [...rows]
  .sort((a, b) => b.bootMs + b.closeMs - (a.bootMs + a.closeMs))
  .slice(0, 10)) {
  console.log(`  ${String(r.bootMs).padStart(6)} + ${String(r.closeMs).padStart(5)} ms  ${r.file}`);
}

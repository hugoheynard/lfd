#!/usr/bin/env node
/**
 * Réécrit `apps/lfd-api/test/e2e-durations.json` depuis les durées qu'un run
 * VERT de la CI a mesurées, au lieu de rejouer toutes les suites en série en
 * local (plusieurs heures).
 *
 * Chaque éclat e2e de `ci.yml` (job `b2b-backend`) écrit les durées de SES
 * suites (`E2E_DURATIONS_OUT`, rapporteur `test/slow-suites.reporter.cjs`) et
 * les dépose en artefact `e2e-durations-<éclat>`. Ce script télécharge ces
 * artefacts (`gh run download`), les fusionne, et réécrit le fichier au format
 * du rapporteur : trié par nom, en millisecondes entières.
 *
 * ── Pourquoi les durées sont DIVISÉES par le ratio CI/local ─────────────────
 * Le découpage (`e2e-shard.mjs`) ne lit que des durées relatives : brutes ou
 * divisées, il couperait pareil. Mais le fichier n'est pas lu que par lui :
 * une suite neuve y entre à la main avec sa durée LOCALE, et le commentaire de
 * `b2b-backend` raisonne en « durée du fichier × ~2,9 ». Garder les durées CI
 * telles quelles mélangerait deux échelles dans le même fichier, et chaque
 * suite ajoutée à la main pèserait trois fois trop peu. On ramène donc la
 * mesure à l'échelle locale par le ratio stable mesuré en CI (~2,9×).
 *
 * ── Ce qu'il refuse ─────────────────────────────────────────────────────────
 * Un run qui n'est pas terminé en succès (une suite rouge s'arrête tôt, sa
 * durée ment), et un run qui ne couvre pas toutes les suites présentes sur le
 * disque — il les nomme. Une suite mesurée deux fois (deux éclats) aussi : la
 * partition serait cassée, et on ne choisit pas laquelle croire.
 *
 * Usage : `pnpm tool e2e:durations-from-ci [run-id]` — sans argument, le
 * dernier run vert de `ci.yml` sur `dev`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SUITES_DIR = join("apps", "lfd-api", "test");
const DURATIONS = join(SUITES_DIR, "e2e-durations.json");
const ARTIFACT_PREFIX = "e2e-durations-";
/** Une suite prend en CI ~2,9× sa durée locale (commentaire de `b2b-backend`). */
export const CI_TO_LOCAL_RATIO = 2.9;

/** Un refus lisible : le message dit le cas et le geste de sortie. */
export class DurationsRefusal extends Error {}

/** Fusionne les durées des éclats ; refuse une suite mesurée deux fois. */
export function mergeShards(shards) {
  const merged = {};
  for (const shard of shards) {
    for (const [suite, ms] of Object.entries(shard)) {
      if (typeof ms !== "number") {
        throw new DurationsRefusal(`Durée illisible pour ${suite} : ${JSON.stringify(ms)}.`);
      }
      if (suite in merged) {
        throw new DurationsRefusal(
          `${suite} a été mesurée par deux éclats : la partition du run est fausse, choisis un autre run.`,
        );
      }
      merged[suite] = ms;
    }
  }
  return merged;
}

/** Les suites du disque que le run n'a pas mesurées. */
export function missingSuites(onDisk, measured) {
  return onDisk.filter((suite) => !(suite in measured));
}

/** Ramène à l'échelle locale, garde les seules suites du disque, trie par nom. */
export function toLocalFile(measured, onDisk) {
  const sorted = [...onDisk].sort((a, b) => a.localeCompare(b));
  const byName = Object.fromEntries(
    sorted.map((suite) => [suite, Math.round(measured[suite] / CI_TO_LOCAL_RATIO)]),
  );
  return `${JSON.stringify(byName, null, 2)}\n`;
}

/** Refuse un run qui n'est pas un run `ci.yml` terminé en succès. */
export function assertGreen(run) {
  if (run.status !== "completed" || run.conclusion !== "success") {
    throw new DurationsRefusal(
      `Le run ${run.databaseId} n'est pas vert (${run.status}/${run.conclusion ?? "—"}) : ` +
        "une suite rouge s'arrête tôt et sa durée ment. Prends un run vert.",
    );
  }
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

function lastGreenRunId() {
  const runs = JSON.parse(
    gh([
      "run",
      "list",
      "--workflow",
      "ci.yml",
      "--branch",
      "dev",
      "--status",
      "success",
      "--limit",
      "1",
      "--json",
      "databaseId",
    ]),
  );
  if (runs.length === 0) {
    throw new DurationsRefusal("Aucun run vert de ci.yml sur dev : passe un run-id.");
  }
  return String(runs[0].databaseId);
}

function suitesOnDisk() {
  return readdirSync(SUITES_DIR)
    .filter((file) => file.endsWith(".e2e-spec.ts"))
    .map((file) => `test/${file}`)
    .sort();
}

function downloadShards(runId) {
  const dir = mkdtempSync(join(tmpdir(), "e2e-durations-"));
  try {
    try {
      gh(["run", "download", runId, "--pattern", `${ARTIFACT_PREFIX}*`, "--dir", dir]);
    } catch {
      throw new DurationsRefusal(
        `Le run ${runId} n'a pas d'artefact ${ARTIFACT_PREFIX}* (e2e sautées, ou artefacts expirés) : passe un run qui a fait tourner les e2e.`,
      );
    }
    return readdirSync(dir, { recursive: true })
      .filter((file) => String(file).endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(dir, String(file)), "utf8")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const runId = process.argv[2] ?? lastGreenRunId();
  const run = JSON.parse(gh(["run", "view", runId, "--json", "databaseId,status,conclusion"]));
  assertGreen(run);
  const measured = mergeShards(downloadShards(runId));
  const onDisk = suitesOnDisk();
  const missing = missingSuites(onDisk, measured);
  if (missing.length > 0) {
    throw new DurationsRefusal(
      `Le run ${runId} ne couvre pas ${missing.length} suite(s) du disque :\n  ${missing.join("\n  ")}\n` +
        "Prends un run plus récent, ou ajoute ces durées à la main.",
    );
  }
  writeFileSync(DURATIONS, toLocalFile(measured, onDisk));
  console.log(
    `✔ ${onDisk.length} durées réécrites dans ${DURATIONS} depuis le run ${runId} (÷ ${CI_TO_LOCAL_RATIO}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (cause) {
    console.error(`\n✖ ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exit(1);
  }
}

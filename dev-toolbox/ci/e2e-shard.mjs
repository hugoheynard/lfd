#!/usr/bin/env node
/**
 * Répartit les suites e2e entre N shards, PAR DURÉE et non par ordre alphabétique.
 *
 * Jest sait sharder (`--shard=3/4`) mais il trie les chemins et coupe en parts
 * égales : il n'a aucune notion de durée. D'où l'écart mesuré en CI le
 * 2026-08-29 — 1 min 46 pour le shard 1, 4 min 05 pour le shard 3, sur le même
 * nombre de suites. Le shard le plus lent tient la CI ; les trois autres
 * attendent.
 *
 * On lui retire donc la décision : ce script imprime la LISTE des fichiers d'un
 * shard, et Jest la reçoit via `--runTestsByPath`.
 *
 * ── L'algorithme ────────────────────────────────────────────────────────────
 * Le plus long d'abord, chacun au shard le moins chargé (« LPT », l'ordonnancement
 * glouton par durée décroissante). Quinze lignes, et il ne dépasse jamais 4/3 de
 * l'optimal — largement assez pour un écart qu'on cherche à ramener de 2,3× à
 * ~1,1×.
 *
 * ── Pourquoi un fichier VERSIONNÉ ───────────────────────────────────────────
 * Les durées viennent de `test/e2e-durations.json`, régénéré à la main
 * (`pnpm --filter lfd-api e2e:rebalance`), et non d'un cache réécrit à chaque run.
 *
 * Un cache automatique enregistrerait surtout le BRUIT : les runners varient du
 * simple au triple d'un run à l'autre (mesuré le 2026-08-29 : les mêmes 51
 * suites en 6 min 40 puis 16 min 45). Le découpage danserait sans que rien de
 * réel n'ait changé, et deux runs du même commit ne feraient pas le même
 * travail. Un fichier committé se relit en diff, donc s'accuse.
 *
 * ── Ce qui ne peut PAS arriver ──────────────────────────────────────────────
 * 🔴 Qu'une suite ne tourne nulle part. La partition porte sur les fichiers
 * PRÉSENTS SUR LE DISQUE, jamais sur les clés du JSON : une suite ajoutée sans
 * mesure prend un poids par défaut et part dans un shard comme les autres. Le
 * fichier de durées ne décide que de l'ÉQUILIBRE, jamais du périmètre.
 *
 * Usage : `node dev-toolbox/ci/e2e-shard.mjs <index> <total>` (index de 1 à N).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP = "apps/lfd-api";
const SUITES_DIR = join(APP, "test");
const DURATIONS = join(SUITES_DIR, "e2e-durations.json");

/** Les suites telles qu'elles existent — la source de vérité du PÉRIMÈTRE. */
function suitesOnDisk() {
  return readdirSync(SUITES_DIR)
    .filter((file) => file.endsWith(".e2e-spec.ts"))
    .map((file) => `test/${file}`)
    .sort();
}

/** Les durées connues, en ms. Absentes ou illisibles : on partitionne à plat. */
function knownDurations() {
  try {
    const parsed = JSON.parse(readFileSync(DURATIONS, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Le poids d'une suite non mesurée : la MOYENNE des connues.
 *
 * Ni zéro (elle s'empilerait sur un shard déjà plein en croyant ne rien peser),
 * ni le maximum (une suite triviale viderait un shard). La moyenne se trompe
 * dans les deux sens et jamais beaucoup.
 */
function defaultWeight(durations) {
  const values = Object.values(durations).filter((value) => typeof value === "number");
  if (values.length === 0) {
    return 1;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function partition(suites, durations, total) {
  const fallback = defaultWeight(durations);
  const weighted = suites
    .map((suite) => ({ suite, weight: durations[suite] ?? fallback }))
    .sort((a, b) => b.weight - a.weight);

  const shards = Array.from({ length: total }, () => ({ load: 0, suites: [] }));
  for (const { suite, weight } of weighted) {
    // Le moins chargé — à égalité, le premier, pour que la partition soit
    // DÉTERMINISTE : deux exécutions du script rendent le même découpage.
    const target = shards.reduce((best, shard) => (shard.load < best.load ? shard : best));
    target.suites.push(suite);
    target.load += weight;
  }
  return shards;
}

const index = Number(process.argv[2]);
const total = Number(process.argv[3]);
if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total) {
  console.error("usage : e2e-shard.mjs <index> <total>   (index de 1 à total)");
  process.exit(1);
}

const suites = suitesOnDisk();
const durations = knownDurations();
const shards = partition(suites, durations, total);
const mine = shards[index - 1];

const unmeasured = suites.filter((suite) => !(suite in durations));
if (unmeasured.length > 0) {
  console.error(
    `⚠️  ${unmeasured.length} suite(s) sans durée mesurée, poids par défaut appliqué :\n` +
      unmeasured.map((suite) => `      ${suite}`).join("\n") +
      "\n    `pnpm --filter lfd-api e2e:rebalance` remet le fichier à jour.\n",
  );
}
console.error(
  `Shard ${String(index)}/${String(total)} — ${String(mine.suites.length)} suites, ` +
    `${(mine.load / 1000).toFixed(1)}s attendues ` +
    `(shards : ${shards.map((shard) => `${(shard.load / 1000).toFixed(0)}s`).join(" · ")})`,
);

// Sur stdout, RIEN QUE les chemins : la sortie est consommée par un `$(…)`.
console.log(mine.suites.join(" "));

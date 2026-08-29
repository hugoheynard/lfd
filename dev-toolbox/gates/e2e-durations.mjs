#!/usr/bin/env node
/**
 * Gate : chaque suite e2e a sa durée mesurée.
 *
 * Le découpage en shards se fait PAR DURÉE (`dev-toolbox/ci/e2e-shard.mjs`).
 * Une suite absente du fichier tourne quand même — le périmètre vient du
 * disque, jamais du JSON — mais avec un poids par DÉFAUT. Une seule s'oublie
 * sans conséquence ; dix, et l'équilibre qu'on vient de gagner se dissout sans
 * que rien ne rougisse.
 *
 * C'est la classe de dette qui ne fait jamais de bruit : personne ne se lève un
 * matin en décidant de déséquilibrer la CI, elle dérive d'un oubli à la fois.
 * Cette porte compte les oublis à l'entrée.
 *
 * Le remède est une commande : `pnpm --filter lfd-api e2e:rebalance`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUITES_DIR = join("apps", "lfd-api", "test");
const DURATIONS = join(SUITES_DIR, "e2e-durations.json");

const suites = readdirSync(SUITES_DIR)
  .filter((file) => file.endsWith(".e2e-spec.ts"))
  .map((file) => `test/${file}`)
  .sort();

let durations;
try {
  durations = JSON.parse(readFileSync(DURATIONS, "utf8"));
} catch (cause) {
  console.error(
    `\n✖ ${DURATIONS} illisible ou absent.\n`,
    cause instanceof Error ? cause.message : "",
  );
  process.exit(1);
}

const missing = suites.filter((suite) => !(suite in durations));
// Une entrée qui ne correspond plus à aucun fichier : la suite a été renommée
// ou supprimée. Sans ménage, le fichier accumule des fantômes qui faussent la
// moyenne servant de poids par défaut.
const ghosts = Object.keys(durations).filter((suite) => !suites.includes(suite));

if (missing.length > 0 || ghosts.length > 0) {
  console.error("\n✖ Le fichier des durées e2e ne colle plus aux suites :\n");
  for (const suite of missing) {
    console.error(`  + ${suite}  (nouvelle, jamais mesurée)`);
  }
  for (const suite of ghosts) {
    console.error(`  - ${suite}  (mesurée, mais le fichier n'existe plus)`);
  }
  console.error("\n  pnpm --filter lfd-api e2e:rebalance\n");
  process.exit(1);
}

console.log(`✓ e2e-durations : les ${String(suites.length)} suites ont leur durée`);

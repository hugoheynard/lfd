#!/usr/bin/env node
/**
 * Les e2e du chiffrage et de la commande, en UNE chaîne (Hugo, 2026-11-03 ;
 * plan `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md` §4).
 *
 * La liste n'est pas écrite à la main : elle se DÉDUIT du contenu des suites,
 * pour qu'une suite neuve qui touche la commande y entre sans qu'on y pense.
 * Le critère — une suite `apps/lfd-api/test/*.e2e-spec.ts` en fait partie si
 * son texte :
 *
 *  - appelle une route de commande : `/orders` (donc `/shop/orders`,
 *    `/admin/orders`, `/admin/counter/orders`, la révision
 *    `/orders/:id/revisions` et l'estimation `/orders/estimate`) ;
 *  - appelle le devis `/shop/quote`, le comptoir `/admin/counter`, ou une
 *    estimation `/estimate` ;
 *  - ou importe le golden master (`./pricing-golden-master*`) ou une scène
 *    de commande (`./order-*-scene`, `./shortfall-decision-scene`).
 *
 * Refuse de démarrer si une autre chaîne e2e tourne (un `node` dont la commande porte `jest.e2e.cjs`) :
 * deux chaînes ont déjà fait tomber le Postgres local.
 *
 * `--list` imprime la liste et s'arrête.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const API = join(ROOT, "apps", "lfd-api");
const TEST_DIR = join(API, "test");

const ROUTES = [/\/orders\b/, /\/shop\/quote\b/, /\/admin\/counter\b/, /\/estimate\b/];
const IMPORTS = [
  /from "\.\/pricing-golden-master[\w-]*\.js"/,
  /from "\.\/order-[\w-]+-scene\.js"/,
  /from "\.\/shortfall-decision-scene\.js"/,
];

/** Les suites qui touchent la passation, la révision, le chiffrage ou le comptoir. */
export function orderSuites(dir = TEST_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".e2e-spec.ts"))
    .filter((name) => {
      const text = readFileSync(join(dir, name), "utf8");
      return [...ROUTES, ...IMPORTS].some((pattern) => pattern.test(text));
    })
    .sort()
    .map((name) => join(dir, name));
}

/**
 * Les pid d'un JEST e2e en cours — un processus `node` dont la commande porte
 * `jest.e2e.cjs`. Pas un `pgrep -f jest.e2e.cjs` nu : une boucle d'attente du
 * genre `until ! pgrep -f jest.e2e.cjs` porte ce texte dans SA commande, se
 * trouvait elle-même, et bloquait le script pour toujours (2026-11-03).
 */
function otherChainRunning() {
  let listing = "";
  try {
    listing = execFileSync("ps", ["-axo", "pid=,comm=,args="], { encoding: "utf8" });
  } catch {
    return "";
  }
  return listing
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([, comm, ...args]) =>
        /(^|\/)node$/.test(comm ?? "") && args.join(" ").includes("jest.e2e.cjs"),
    )
    .map(([pid]) => pid)
    .join("\n");
}

function main() {
  const suites = orderSuites();
  if (process.argv.includes("--list")) {
    for (const suite of suites) console.log(relative(API, suite));
    console.log(`${suites.length} suites`);
    return 0;
  }
  const running = otherChainRunning();
  if (running !== "") {
    console.error(
      `Une autre chaîne e2e tourne déjà (pid ${running.split("\n").join(", ")}) : ` +
        "attendez qu'elle finisse — deux chaînes en même temps font tomber le Postgres local.",
    );
    return 1;
  }
  console.log(`e2e de la commande : ${suites.length} suites`);
  const result = spawnSync(
    "pnpm",
    ["run", "test:e2e", "--runTestsByPath", ...suites.map((s) => relative(API, s))],
    { cwd: API, stdio: "inherit" },
  );
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}

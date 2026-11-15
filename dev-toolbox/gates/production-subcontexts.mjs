#!/usr/bin/env node
/**
 * Gate : **le fournil est un noyau, et des métiers autour** (`documentation/fournil/architecture-contexte-production.md`,
 * « La porte `production-subcontexts` » et « Les règles de la surface »).
 *
 * `src/production/` se range en `day/` (la journée), `plan/`, `atelier/`,
 * `quality/`, `resupply/`, `shared/print/` et `channels/`. Cette porte tient
 * cette forme : elle publie la carte, et compte en dette décroissante ce qui
 * la viole.
 *
 * ## Où se lit le sous-contexte d'un fichier
 *
 * Son dossier, dès qu'il a déménagé. Tant qu'il est à plat, la carte
 * versionnée `production-subcontexts.map.json` — construite sur le graphe
 * d'imports réel le 2026-11-15, chaque cas non évident avec sa raison. Un
 * fichier déplacé sort de la carte ; un fichier neuf à plat y entre.
 *
 * ## Ce qu'elle refuse
 *
 * - **une arête hors du schéma** : chaque métier lit `day/`, `shared/print/`
 *   et `channels/` ; `shared/print/` lit `day/`, et du commerce le SEUL
 *   port de la couleur d'une commande (`ADMITTED_FILES`) ; `channels/` lit `day/` en
 *   direct ; seules `atelier → quality` et `plan → resupply` relient deux
 *   métiers ; `day/` n'importe que `channels/`. Les types comptent ;
 * - **un import qui passe à côté de la porte** : entre sous-contextes, on
 *   entre par `index.ts` (`channels/` n'en est pas un) ; le module Nest d'un
 *   métier (`<dossier>/*.module.ts`) entre chez un autre par son module Nest,
 *   sur les mêmes arêtes. Tant que la porte n'existe pas, ces imports sont
 *   la dette, comptée par paire ;
 * - **un test** qui lit l'intérieur d'un AUTRE sous-contexte (le sien est
 *   libre) — même règle de porte, compté à part ;
 * - **un modèle lu hors de son sous-contexte** : chaque modèle du schéma
 *   `production` a un propriétaire (la carte, `models`) ; un autre
 *   sous-contexte qui le lit ou l'écrit, en Prisma ou en SQL, franchit la
 *   frontière que ses imports respectent ;
 * - **un abonné en mémoire** (`@EventsHandler`) qui écoute un fait d'un autre
 *   sous-contexte : entre métiers, l'abonné est un `@DurableHandler` ;
 * - **un cycle d'imports d'exécution qui traverse un `index.ts`** ;
 * - **un message d'un autre métier** — commande envoyée, requête posée, fait
 *   écouté — hors des arêtes admises ou à côté de son `index.ts`, et tout
 *   `@CommandHandler`/`@QueryHandler` d'un message d'un autre métier. Le bus
 *   est global : on lit la classe du message jusqu'au fichier qui la déclare,
 *   pas seulement son import (`lib/production-subcontexts-wiring.mjs`) ;
 * - **un fournisseur ou un contrôleur déclaré dans deux modules du fournil** :
 *   Nest en ferait deux exemplaires, et deux caches qui divergent. Le partage
 *   passe par `exports` d'un module et `imports` de l'autre ;
 * - **une racine qui lit l'intérieur d'un métier** : `appBootstrap/` et `dev/`
 *   entrent par `<métier>/index.ts`, un module à la racine d'un métier,
 *   `production.module.ts` ou `channels/` — dette comptée par fichier ;
 * - **un index qui grandit** : le nombre de noms qu'exporte chaque
 *   `<métier>/index.ts` est une dette décroissante (`indexSize`,
 *   `lib/production-subcontexts-index-size.mjs`).
 *
 * Exemptés : `production.module.ts` (racine de composition du bloc, qui
 * importe les modules de métier ; chacun d'eux est jugé comme les autres
 * fichiers de son dossier), et `test/` : un e2e qui vérifie une ligne en base
 * doit pouvoir regarder dedans.
 *
 * ## La dette, décroissante
 *
 * `production-subcontexts-debt.json` : une entrée par arête, modèle, abonné
 * ou cycle ; un compte par paire pour les imports hors porte (ils changent de
 * chemin à chaque déménagement, pas de nombre). Une violation hors liste
 * échoue ; une entrée qui ne viole plus échoue aussi, un compte trop haut
 * aussi — sans quoi la ligne resterait un passe-droit.
 *
 * Usage : `pnpm gate production-subcontexts` ; `--carte` détaille la surface
 * de départ fichier par fichier ; `--brouillon-dette` imprime la dette
 * mesurée (à relire au déménagement : une entrée neuve est une faute, pas
 * une ligne à coller).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { prismaSchemaSource } from "./lib/prisma-schema.mjs";
import {
  ALLOWED,
  GATED,
  ROOT_CONTEXT,
  classify,
  doorOf,
  importsOf,
  indexCycles,
  isAdmittedFile,
  isContextModule,
  isTest,
  memorySubscriptions,
  modelsTouched,
  productionModels,
  testContext,
} from "./lib/production-subcontexts-graph.mjs";
import { indexSizeFailures, indexSizes } from "./lib/production-subcontexts-index-size.mjs";
import { printReport } from "./lib/production-subcontexts-report.mjs";
import {
  crossMessages,
  duplicatedProviders,
  rootImports,
} from "./lib/production-subcontexts-wiring.mjs";

const SOURCES = "apps/lfd-api/src";
const PRODUCTION = `${SOURCES}/production`;
const ROOTS = ["appBootstrap", "dev"];
const HERE = fileURLToPath(new URL(".", import.meta.url));
const MAP_FILE = join(HERE, "production-subcontexts.map.json");
const DEBT_FILE = join(HERE, "production-subcontexts-debt.json");

/**
 * Ce qu'un import de `from` (contexte `a`) vers `to` (contexte `b`) viole, ou
 * `null`. Un module Nest de métier entre chez un autre par son module Nest :
 * l'arête reste jugée, la porte est l'autre.
 */
function judgeEdge(a, b, from, to) {
  if (a === b || a === ROOT_CONTEXT || b === ROOT_CONTEXT || b === undefined) return null;
  if (!ALLOWED[a]?.includes(b) && !isAdmittedFile(a, to)) return "edge";
  if (isContextModule(from, a) && isContextModule(to, b)) return null;
  if (GATED.includes(a) && GATED.includes(b) && to !== doorOf(b)) return "door";
  return null;
}

function bump(map, key, value = 1) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function addTo(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

/**
 * Tout ce qui traverse, sur `{ path, source }` (chemins sous `production/`).
 * `map` : `{ files, models }` de la carte ; `models` : ceux du schéma ;
 * `roots` : les fichiers des racines, chemins sous `src/`.
 */
export function analyse(files, map, models, roots = []) {
  const paths = files.map((file) => file.path);
  const { contexts, problems } = classify(paths, map.files);
  const found = {
    edges: new Set(),
    door: new Map(),
    testDoor: new Map(),
    models: new Set(),
    subscribers: new Set(),
    indexCycles: [],
  };
  const surface = new Map();
  const runtime = [];
  for (const known of models.map((model) => model.name)) {
    if (map.models[known] === undefined)
      problems.push(`modèle ${known} sans propriétaire dans la carte`);
  }
  for (const owned of Object.keys(map.models)) {
    if (!models.some((model) => model.name === owned))
      problems.push(`modèle ${owned} dans la carte mais absent du schéma`);
  }
  for (const { path, source } of files) {
    const imports = importsOf(path, source).filter(({ target }) => contexts.has(target));
    if (isTest(path)) {
      const own = testContext(path, imports, contexts);
      for (const { target } of imports) {
        const theirs = contexts.get(target);
        if (own !== null && theirs !== own && GATED.includes(theirs) && target !== doorOf(theirs)) {
          bump(found.testDoor, `${own} → ${theirs}`);
        }
      }
      continue;
    }
    const own = contexts.get(path);
    for (const { target, typeOnly } of imports) {
      if (!typeOnly) runtime.push([path, target]);
      const theirs = contexts.get(target);
      const verdict = judgeEdge(own, theirs, path, target);
      if (verdict === "edge") found.edges.add(`${path} → ${target}`);
      if (verdict === "door") bump(found.door, `${own} → ${theirs}`);
      if (own !== theirs && own !== ROOT_CONTEXT && theirs !== ROOT_CONTEXT) {
        addTo(surface, theirs, `${target}\t${own}`);
      }
    }
    if (own === ROOT_CONTEXT) continue;
    for (const model of modelsTouched(source, models)) {
      if (map.models[model] !== own) found.models.add(`${path} → ${model} (${map.models[model]})`);
    }
    for (const { event, origin } of memorySubscriptions(path, source)) {
      if (origin !== null && contexts.has(origin) && contexts.get(origin) !== own) {
        found.subscribers.add(`${path} → ${event} (${contexts.get(origin)})`);
      }
    }
  }
  found.indexCycles = indexCycles(runtime);
  found.messages = crossMessages(files, contexts);
  found.providers = duplicatedProviders(files);
  found.roots = rootImports(roots);
  found.indexSize = indexSizes(files, problems);
  return { contexts, problems, found, surface };
}

const LISTS = {
  edges:
    "arête hors du schéma — passe par un port publié, ou déplace le fichier là où vivent ses dépendances",
  models: "modèle lu hors de son sous-contexte — lis-le par un port que son propriétaire publie",
  subscribers: "abonné en mémoire sur le fait d'un autre métier — fais-en un @DurableHandler",
  indexCycles: "cycle d'exécution à travers un index.ts — l'API ne démarrerait pas ; coupe-le",
  messages:
    "message d'un autre métier hors de sa porte ou des arêtes admises — passe par son index.ts, ou par un port",
  providers:
    "fournisseur déclaré dans deux modules : deux exemplaires — exporte-le de l'un, importe le module dans l'autre",
};
const COUNTS = {
  door: "imports hors porte",
  testDoor: "imports de tests hors porte",
  roots: "imports d'une racine dans l'intérieur d'un métier",
};

/** Le verdict : ce qui est neuf, ce qui ne viole plus, ce qui est compté trop haut. */
export function verdict(found, debt) {
  const failures = [];
  for (const [name, why] of Object.entries(LISTS)) {
    const admitted = new Set(debt[name] ?? []);
    const seen = new Set(found[name]);
    for (const key of seen) if (!admitted.has(key)) failures.push(`  ${key}  ${why}`);
    for (const key of admitted) {
      if (!seen.has(key))
        failures.push(`  ${key}  ne viole plus : retire-le de la dette (${name})`);
    }
  }
  for (const [name, label] of Object.entries(COUNTS)) {
    const admitted = debt[name] ?? {};
    for (const [pair, count] of found[name]) {
      const allowed = admitted[pair] ?? 0;
      if (count > allowed) {
        failures.push(
          `  ${pair}  ${count} ${label}, la dette en admet ${allowed} — entre par l'index.ts du sous-contexte`,
        );
      }
    }
    for (const [pair, allowed] of Object.entries(admitted)) {
      const count = found[name].get(pair) ?? 0;
      if (count < allowed)
        failures.push(
          `  ${pair}  ${count} ${label}, la dette en compte ${allowed} — baisse le compte`,
        );
    }
  }
  failures.push(...indexSizeFailures(found.indexSize ?? new Map(), debt.indexSize));
  return failures;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function main() {
  const root = join(process.cwd(), PRODUCTION);
  const files = sourceFiles(root).map((file) => ({
    path: relative(root, file).split("\\").join("/"),
    source: readFileSync(file, "utf8"),
  }));
  const map = JSON.parse(readFileSync(MAP_FILE, "utf8"));
  const models = productionModels(prismaSchemaSource());
  const roots = ROOTS.flatMap((root) =>
    sourceFiles(join(process.cwd(), SOURCES, root)).map((file) => ({
      path: relative(join(process.cwd(), SOURCES), file).split("\\").join("/"),
      source: readFileSync(file, "utf8"),
    })),
  );
  const { contexts, problems, found, surface } = analyse(files, map, models, roots);
  if (process.argv.includes("--brouillon-dette")) {
    const plain = (name) => [...found[name]].sort();
    const counts = (name) =>
      Object.fromEntries([...found[name]].sort(([a], [b]) => a.localeCompare(b)));
    const lists = ["edges", "models", "subscribers", "indexCycles", "messages", "providers"];
    const draft = Object.fromEntries(lists.map((name) => [name, plain(name)]));
    for (const name of ["door", "testDoor", "roots", "indexSize"]) draft[name] = counts(name);
    console.log(JSON.stringify(draft, null, 2));
    return;
  }
  const debt = JSON.parse(readFileSync(DEBT_FILE, "utf8"));
  const failures = [...problems.map((problem) => `  ${problem}`), ...verdict(found, debt)];
  if (failures.length > 0) {
    console.error(`\n✗ production-subcontexts\n\n${failures.join("\n")}\n`);
    process.exit(1);
  }
  console.log("✓ production-subcontexts : aucune traversée neuve entre les métiers du fournil.");
  printReport(contexts, surface, found, process.argv.includes("--carte"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

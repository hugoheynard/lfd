#!/usr/bin/env node
/**
 * Gate : **le fournil est un noyau, et des métiers autour** (plan
 * `documentation/fournil/plan-decoupage-du-fournil.md`, § 1 et § 1 bis).
 *
 * `src/production/` est un seul contexte à plat. Le découpage le range en
 * `day/` (la journée), `plan/`, `atelier/`, `quality/`, `resupply/`,
 * `shared/print/` et `channels/`. Cette porte tient la forme AVANT que le
 * premier fichier bouge : elle publie la carte, mesure la surface de départ
 * de chaque sous-contexte, et compte ce qui la viole aujourd'hui.
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
 *   et `channels/` ; `shared/print/` lit `day/` ; `channels/` lit `day/` en
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
 * - **un cycle d'imports d'exécution qui traverse un `index.ts`**.
 *
 * Exemptés : `production.module.ts` (racine de composition du bloc, qui
 * importe les modules de métier ; chacun d'eux est jugé comme les autres
 * fichiers de son dossier), et hors
 * de la lecture, `appBootstrap/`, `dev/` et `test/`.
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
  isContextModule,
  isTest,
  memorySubscriptions,
  modelsTouched,
  productionModels,
  testContext,
} from "./lib/production-subcontexts-graph.mjs";

const PRODUCTION = "apps/lfd-api/src/production";
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
  if (!ALLOWED[a]?.includes(b)) return "edge";
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
 * `map` : `{ files, models }` de la carte ; `models` : ceux du schéma.
 */
export function analyse(files, map, models) {
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
  return { contexts, problems, found, surface };
}

const LISTS = {
  edges:
    "arête hors du schéma — passe par un port publié, ou déplace le fichier là où vivent ses dépendances",
  models: "modèle lu hors de son sous-contexte — lis-le par un port que son propriétaire publie",
  subscribers: "abonné en mémoire sur le fait d'un autre métier — fais-en un @DurableHandler",
  indexCycles: "cycle d'exécution à travers un index.ts — l'API ne démarrerait pas ; coupe-le",
};
const COUNTS = {
  door: "imports hors porte",
  testDoor: "imports de tests hors porte",
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
  return failures;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** La carte : par sous-contexte, ses fichiers, et ce qu'il utilise chez les autres. */
function printMap(contexts, surface, detailed) {
  const owners = new Map();
  for (const [path, context] of contexts) addTo(owners, context, path);
  const uses = new Map();
  for (const [theirs, entries] of surface) {
    for (const entry of entries)
      addTo(uses, entry.split("\t")[1], `${theirs}\t${entry.split("\t")[0]}`);
  }
  console.log("  La carte (fichiers hors tests) :");
  for (const context of [...GATED, "channels", ROOT_CONTEXT]) {
    const used = [...(uses.get(context) ?? [])].map((entry) => entry.split("\t"));
    const byTarget = new Map();
    for (const [theirs, file] of used) addTo(byTarget, theirs, file);
    const summary = [...byTarget].map(([theirs, set]) => `${theirs} ${set.size}`).join(", ");
    const exposed = new Set([...(surface.get(context) ?? [])].map((entry) => entry.split("\t")[0]));
    console.log(
      `    ${context.padEnd(13)} ${String(owners.get(context)?.size ?? 0).padStart(3)} fichiers · ` +
        `surface ${String(exposed.size).padStart(3)} · utilise : ${summary || "—"}`,
    );
    if (detailed) for (const file of [...exposed].sort()) console.log(`        ${file}`);
  }
}

function main() {
  const root = join(process.cwd(), PRODUCTION);
  const files = sourceFiles(root).map((file) => ({
    path: relative(root, file).split("\\").join("/"),
    source: readFileSync(file, "utf8"),
  }));
  const map = JSON.parse(readFileSync(MAP_FILE, "utf8"));
  const models = productionModels(prismaSchemaSource());
  const { contexts, problems, found, surface } = analyse(files, map, models);
  if (process.argv.includes("--brouillon-dette")) {
    const plain = (name) => [...found[name]].sort();
    const counts = (name) =>
      Object.fromEntries([...found[name]].sort(([a], [b]) => a.localeCompare(b)));
    const draft = {
      edges: plain("edges"),
      models: plain("models"),
      subscribers: plain("subscribers"),
    };
    Object.assign(draft, {
      indexCycles: plain("indexCycles"),
      door: counts("door"),
      testDoor: counts("testDoor"),
    });
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
  printMap(contexts, surface, process.argv.includes("--carte"));
  const total = (name) => [...found[name].values()].reduce((sum, count) => sum + count, 0);
  console.log("  Dette restante — comptée, pas ignorée :");
  console.log(`    arêtes hors du schéma    ${found.edges.size}`);
  console.log(
    `    imports hors porte       ${total("door")}  (${[...found.door].map(([p, c]) => `${p} ${c}`).join(", ")})`,
  );
  console.log(`    tests hors porte         ${total("testDoor")}`);
  console.log(`    modèles hors propriétaire ${found.models.size}`);
  console.log(`    abonnés en mémoire       ${found.subscribers.size}`);
  console.log(`    cycles par un index.ts   ${found.indexCycles.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

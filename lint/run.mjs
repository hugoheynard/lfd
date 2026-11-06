#!/usr/bin/env node
/**
 * **Le lanceur des portes et des outils du dépôt** (2026-11-06, Hugo : « je
 * veux vraiment que dans package.json il n'y ait que l'essentiel »).
 *
 * Le `package.json` racine portait 85 scripts, dont 61 portes chaînées dans
 * une ligne de 3 000 caractères. Elles vivent désormais dans
 * `lint/lint-backend.json` — chacune avec ce qu'elle tient, sa date et ce
 * qu'elle lit — et les outils occasionnels dans `lint/tools.json`.
 *
 * ```
 * pnpm lint:gates            toutes les portes, toutes lancées, un résumé à la fin
 * pnpm gate <nom>            une porte (sans « lint: »)
 * pnpm gate --list           la liste, avec ce que chacune tient
 * pnpm lint:watch            relance les portes dont un fichier lu change
 * pnpm tool [<nom> [args]]   les outils occasionnels ; sans nom, la liste
 * ```
 *
 * `lint:gates` ne s'arrête plus à la première rouge : il les lance toutes et
 * dit lesquelles ont échoué — une passe rend tout ce qu'il y a à corriger.
 * Son code de sortie reste non nul au premier échec, comme avant. Il refuse
 * aussi de tourner si le compte du § 10 de `CLAUDE.md` (« les N portes du
 * dépôt ») ne dit plus la liste : un chiffre faux s'y est déjà glissé.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  commandOf,
  countMismatch,
  loadGates,
  loadTools,
  malformedGates,
  summary,
} from "./lib/catalogue.mjs";
import { watchGates } from "./lib/watch.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Lance une commande à la racine, sorties héritées ; rend son code. */
function exec(program, args, shell = false) {
  return new Promise((resolve) => {
    const child = spawn(program, args, { cwd: ROOT, stdio: "inherit", shell });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function runGate(gate) {
  const [program, ...args] = commandOf(gate);
  const code = await exec(program, args);
  return { name: gate.name, ok: code === 0 };
}

/** Le catalogue, refusé s'il est incomplet ou si CLAUDE.md ne le compte plus juste. */
function checkedGates() {
  const gates = loadGates(ROOT);
  const problems = malformedGates(gates);
  const count = countMismatch(readFileSync(`${ROOT}/CLAUDE.md`, "utf8"), gates.length);
  if (count !== null) problems.push(count);
  if (problems.length > 0) {
    console.error("\n✗ le catalogue des portes\n");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  return gates;
}

async function all() {
  const results = [];
  for (const gate of checkedGates()) results.push(await runGate(gate));
  console.log(summary(results));
  process.exit(results.every((result) => result.ok) ? 0 : 1);
}

function list() {
  const gates = checkedGates();
  const width = Math.max(...gates.map((gate) => gate.name.length));
  console.log(`${gates.length} portes (lint/lint-backend.json) — pnpm gate <nom> :\n`);
  for (const gate of gates) {
    console.log(`  ${gate.name.padEnd(width)}  ${gate.since}  ${gate.holds}`);
  }
}

async function one(name) {
  if (name === undefined || name === "--list") return list();
  const gates = checkedGates();
  const gate = gates.find((candidate) => candidate.name === name.replace(/^lint:/, ""));
  if (gate === undefined) {
    console.error(`✗ aucune porte « ${name} ». La liste : pnpm gate --list`);
    process.exit(1);
  }
  const { ok } = await runGate(gate);
  process.exit(ok ? 0 : 1);
}

async function tool(name, args) {
  const tools = loadTools(ROOT);
  if (name === undefined || name === "--list") {
    const width = Math.max(...tools.map((entry) => entry.name.length));
    console.log(`${tools.length} outils (lint/tools.json) — pnpm tool <nom> [arguments] :\n`);
    for (const entry of tools) console.log(`  ${entry.name.padEnd(width)}  ${entry.does}`);
    return;
  }
  const entry = tools.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    console.error(`✗ aucun outil « ${name} ». La liste : pnpm tool`);
    process.exit(1);
  }
  const quoted = args.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`);
  process.exit(await exec([entry.run, ...quoted].join(" "), [], true));
}

const [mode, name, ...rest] = process.argv.slice(2);
const MODES = {
  all,
  gate: () => one(name),
  watch: () => watchGates(ROOT, checkedGates(), runGate),
  tool: () => tool(name, rest),
};
if (!(mode in MODES)) {
  console.error("usage : node lint/run.mjs all | gate <nom>|--list | watch | tool [<nom> …]");
  process.exit(2);
}
await MODES[mode]();

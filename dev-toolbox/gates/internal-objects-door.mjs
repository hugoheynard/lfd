#!/usr/bin/env node
/**
 * Gate : **un seul chemin vers les objets partagés**
 * (`documentation/caching-usage/le-cache-du-back-office.md`, § 3).
 *
 * Le cache d'un point d'entrée du Worker gardait un « absent » d'un objet
 * partagé et le resservait à l'API. Deux fonctions communes ferment ce
 * chemin ; cette porte les rend obligatoires :
 *
 * - **A** (`apps/lfd-api/src`) : la porte part des lectures de
 *   `shopShelfCacheUrl()` / `dayVersionsCacheUrl()` et suit chaque classe
 *   construite avec cette URL jusqu'à son fichier. Là, tout appel réseau est
 *   `this.fetchFn(url, uncachedInternalCall(…))` ; seul le repli par défaut du
 *   constructeur, `(url, init) => fetch(url, init)`, porte un `fetch` nu. Une
 *   lecture de l'URL que la porte ne sait pas suivre (classe qui lit
 *   `AppConfig` elle-même, fabrique, fonction) est refusée. Hors de ces
 *   fichiers, l'hôte et les variables d'environnement ne se nomment que dans
 *   une liste admise.
 * - **B** (`apps/lfd-api/container`) : toute classe `extends DurableObject`
 *   répond par un `fetch` dont chaque `return` est `withNoStore(…)` ; de même
 *   pour toute fonction exportée de la passerelle pure.
 * - **C** : le test du faux cache importe `INTERNAL_OBJECT_PREFIXES`, itère
 *   dessus, compare le nombre d'objets rejoués au nombre de clés, et garde
 *   son témoin négatif.
 * - **D** : le contrat Worker ↔ passerelle pure passe par un compilateur —
 *   `tsc -p apps/lfd-api/container/tsconfig.json`, qui inclut la passerelle.
 *
 * `cache-control` décide QUELS fichiers de `container/` portent une classe
 * d'objet ou `outboundByHost` ; `container-start` garde la forme de
 * l'affectation. Commentaires retirés ; tests non lus (sauf la règle C).
 * Usage : `pnpm gate internal-objects-door`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bodyAfter,
  callArguments,
  closingIndex,
  importedPathOf,
  returnsOf,
  withoutComments,
} from "./internal-objects-door-source.mjs";

const API_ROOT = "apps/lfd-api/src";
const CONTAINER = "apps/lfd-api/container";
const GATEWAY = `${CONTAINER}/internal-objects-gateway.ts`;
const TABLE = `${CONTAINER}/internal-objects.ts`;
const SPEC = `${CONTAINER}/__tests__/no-cache-in-between.spec.ts`;
const CONTAINER_TSCONFIG = `${CONTAINER}/tsconfig.json`;
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", "__tests__"]);

/** Les deux lectures de l'adresse d'un objet partagé. */
const URL_READ = /\.(?:shopShelfCacheUrl|dayVersionsCacheUrl)\(\)/gu;
/** Ce qui nomme le chemin sans passer par un adaptateur suivi. */
const PATH_MENTION = /objets\.interne|SHOP_SHELF_CACHE_URL|DAY_VERSIONS_CACHE_URL/u;

/**
 * Datée du 2026-11-13 : les seuls fichiers hors adaptateurs qui nomment le
 * chemin, et pourquoi. Aucun n'appelle le réseau.
 */
export const MENTION_ADMITTED = new Map([
  [`${API_ROOT}/platform/config/app-config.ts`, "la seule lecture de l'environnement"],
  [`${API_ROOT}/platform/startup/capability-audit.ts`, "les libellés du rapport de démarrage"],
  [
    `${API_ROOT}/lafoliecoffee/catalog/domain/errors/shelf-cache-not-configured.error.ts`,
    "le message d'une erreur",
  ],
]);

/** Le repli par défaut du constructeur : la seule forme admise d'un `fetch` nu. */
const DEFAULT_FALLBACK =
  /private\s+readonly\s+fetchFn\s*:\s*[\w<>]+\s*=\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*(fetch)\s*\(\s*\1\s*,\s*\2\s*\)/gu;
const NETWORK_CALL = /\b(?:fetch|fetchFn)\s*\(/gu;

/**
 * Règle A, côté module : les classes construites avec l'URL d'un objet, et
 * les lectures que la porte ne sait pas suivre.
 */
export function urlReadsOf(source) {
  const code = withoutComments(source);
  const constructed = new Set();
  const unreadable = [];
  for (const match of code.matchAll(URL_READ)) {
    const before = code.slice(0, match.index);
    const after = code.slice(match.index + match[0].length);
    const variable = /const\s+(\w+)\s*=\s*[\w.]+\s*$/u.exec(before);
    if (/^\s*[!=]==\s*null\b/u.test(after)) continue;
    if (variable !== null) {
      followVariable(code, match.index, variable[1], constructed, unreadable);
    } else if (/origin\s*:\s*[\w.]+$/u.test(before)) {
      const owner = arrayOwner(before);
      if (owner === null) unreadable.push(match[0]);
      else constructed.add(owner);
    } else {
      unreadable.push(match[0]);
    }
  }
  return { constructed: [...constructed], unreadable };
}

/** Chaque usage de la variable, jusqu'à sa prochaine déclaration : `new C(v` ou `v === null`. */
function followVariable(code, from, name, constructed, unreadable) {
  const start = code.indexOf(";", from) + 1;
  const redeclared = code.slice(start).search(new RegExp(`const\\s+${name}\\s*=`, "u"));
  const scope = code.slice(start, redeclared === -1 ? undefined : start + redeclared);
  for (const use of scope.matchAll(new RegExp(`\\b${name}\\b`, "gu"))) {
    const before = scope.slice(0, use.index);
    const after = scope.slice(use.index + name.length);
    const owner = /new\s+(\w+)\s*\(\s*$/u.exec(before);
    if (owner !== null) constructed.add(owner[1]);
    else if (!/^\s*[!=]==\s*null\b/u.test(after))
      unreadable.push(`${name} (${after.slice(0, 30).trim()}…)`);
  }
}

/** La classe dont le tableau `new C([ … origin: … ])` est encore ouvert, ou `null`. */
function arrayOwner(before) {
  const opens = [...before.matchAll(/new\s+(\w+)\s*\(\s*\[/gu)];
  const last = opens.at(-1);
  if (last === undefined) return null;
  const open = last.index + last[0].length - 1;
  return closingIndex(before, open) === -1 ? last[1] : null;
}

/** Règle A, côté adaptateur : chaque appel réseau d'un fichier suivi. */
export function adapterViolations(source) {
  const code = withoutComments(source);
  const failures = [];
  if (!/\buncachedInternalCall\s*\(/u.test(code)) {
    failures.push("aucun appel par uncachedInternalCall(…)");
  }
  const fallbacks = new Set(
    [...code.matchAll(DEFAULT_FALLBACK)].map(
      (match) => match.index + match[0].lastIndexOf("fetch"),
    ),
  );
  for (const call of code.matchAll(NETWORK_CALL)) {
    if (fallbacks.has(call.index)) continue;
    const isThisFetchFn =
      call[0].startsWith("fetchFn") && code.slice(0, call.index).endsWith("this.");
    const args = callArguments(code, call.index + call[0].length - 1);
    if (!isThisFetchFn || args === null || !/^uncachedInternalCall\s*\(/u.test(args[1] ?? "")) {
      failures.push(
        `appel réseau hors de this.fetchFn(url, uncachedInternalCall(…)) : ${call[0]}…`,
      );
    }
  }
  return failures;
}

/** Règle A, hors adaptateurs : le chemin nommé ailleurs que dans la liste admise. */
export function mentionsPath(source) {
  return PATH_MENTION.test(withoutComments(source));
}

/** Règle B : chaque `return` du `fetch` de chaque classe d'objet passe par `withNoStore`. */
export function durableObjectViolations(source) {
  const code = withoutComments(source);
  const failures = [];
  for (const declared of code.matchAll(/class\s+(\w+)\s+extends\s+DurableObject\b/gu)) {
    const body = bodyAfter(code, declared.index);
    const method = body === null ? null : /(?:override\s+)?async\s+fetch\s*\(/u.exec(body);
    const fetchBody = method === null ? null : bodyAfter(body, method.index + method[0].length);
    failures.push(...closedReturns(fetchBody, `${declared[1]}.fetch`));
  }
  return failures;
}

/** Règle B : chaque `return` de chaque fonction exportée de la passerelle passe par `withNoStore`. */
export function gatewayViolations(source) {
  const code = withoutComments(source);
  const exported = [...code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/gu)];
  if (exported.length === 0) return ["aucune fonction exportée : la passerelle est illisible"];
  return exported.flatMap((fn) => closedReturns(bodyAfter(code, fn.index), fn[1]));
}

function closedReturns(body, where) {
  if (body === null) return [`${where} : introuvable ou illisible`];
  const returns = returnsOf(body);
  if (returns.length === 0) return [`${where} : aucun return lisible`];
  return returns
    .filter((expression) => !/^withNoStore\s*\(/u.test(expression))
    .map((expression) => `${where} rend « ${expression.slice(0, 40)} » sans withNoStore(…)`);
}

/** Règle C : les clés de la table, et ce que le test du faux cache doit en faire. */
export function tableKeysOf(source) {
  const match = /INTERNAL_OBJECT_PREFIXES\b[^=]*=\s*\{([^}]*)\}/u.exec(withoutComments(source));
  return match === null ? [] : [...match[1].matchAll(/["']([\w-]+)["']\s*:/gu)].map((m) => m[1]);
}

export function specViolations(source) {
  const code = withoutComments(source);
  const failures = [];
  if (
    !/import\s*\{[^}]*\bINTERNAL_OBJECT_PREFIXES\b[^}]*\}\s*from\s*["']\.\.\/internal-objects(?:\.js)?["']/u.test(
      code,
    )
  ) {
    failures.push("n'importe pas INTERNAL_OBJECT_PREFIXES de ../internal-objects");
  }
  if (!/Object\.(?:keys|entries)\(\s*INTERNAL_OBJECT_PREFIXES\s*\)/u.test(code)) {
    failures.push("n'itère pas sur INTERNAL_OBJECT_PREFIXES (Object.keys / Object.entries)");
  }
  if (!/toHaveLength\(\s*Object\.keys\(\s*INTERNAL_OBJECT_PREFIXES\s*\)\.length\s*\)/u.test(code)) {
    failures.push("ne compare pas le nombre d'objets rejoués au nombre de clés de la table");
  }
  if (!/\bit(?:\.each\([^)]*\))?\(\s*["'`]témoin négatif/u.test(code)) {
    failures.push(
      "n'a plus de témoin négatif (un test dont le titre commence par « témoin négatif »)",
    );
  }
  return failures;
}

/** Règle D : la passerelle et `no-store.ts` sont dans le `include` du tsconfig du Worker. */
export function tsconfigViolations(source) {
  const included = /"include"\s*:\s*\[([^\]]*)\]/u.exec(withoutComments(source))?.[1] ?? "";
  return ["internal-objects-gateway.ts", "no-store.ts"]
    .filter((file) => !included.includes(`"${file}"`))
    .map(
      (file) =>
        `${CONTAINER_TSCONFIG} n'inclut pas ${file} : le contrat avec worker.ts n'est plus compilé`,
    );
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

const unix = (path) => path.split("\\").join("/");

/** Règle A sur le dépôt : les adaptateurs suivis, puis les mentions hors liste. */
function ruleA(root) {
  const failures = [];
  const adapters = new Set();
  const files = sourceFiles(join(root, API_ROOT)).map((file) => unix(relative(root, file)));
  for (const rel of files) {
    const source = readFileSync(join(root, rel), "utf8");
    const { constructed, unreadable } = urlReadsOf(source);
    for (const read of unreadable) {
      failures.push(
        `${rel} : lecture de l'adresse d'un objet partagé illisible (${read}). Passez-la au constructeur d'un adaptateur (new C(url, …)).`,
      );
    }
    for (const name of constructed) {
      const imported = importedPathOf(source, name);
      const target = imported === null ? null : unix(join(dirname(rel), imported));
      if (target === null || !existsSync(join(root, target))) {
        failures.push(
          `${rel} : ${name} est construit avec l'adresse d'un objet, mais son fichier est introuvable.`,
        );
      } else adapters.add(target);
    }
  }
  if (adapters.size === 0)
    failures.push(`aucun adaptateur suivi dans ${API_ROOT} : la porte ne regarde plus rien.`);
  for (const adapter of adapters) {
    for (const failure of adapterViolations(readFileSync(join(root, adapter), "utf8"))) {
      failures.push(`${adapter} : ${failure}`);
    }
  }
  for (const rel of files) {
    if (adapters.has(rel) || MENTION_ADMITTED.has(rel)) continue;
    if (mentionsPath(readFileSync(join(root, rel), "utf8"))) {
      failures.push(
        `${rel} nomme le chemin des objets partagés hors d'un adaptateur suivi : passez par un adaptateur construit avec l'URL de AppConfig.`,
      );
    }
  }
  return { failures, adapters: adapters.size };
}

function ruleB(root) {
  const failures = [];
  for (const file of sourceFiles(join(root, CONTAINER))) {
    const rel = unix(relative(root, file));
    failures.push(
      ...durableObjectViolations(readFileSync(file, "utf8")).map((f) => `${rel} : ${f}`),
    );
  }
  if (!existsSync(join(root, GATEWAY))) return [...failures, `${GATEWAY} introuvable.`];
  return [
    ...failures,
    ...gatewayViolations(readFileSync(join(root, GATEWAY), "utf8")).map((f) => `${GATEWAY} : ${f}`),
  ];
}

function ruleC(root) {
  if (tableKeysOf(readFileSync(join(root, TABLE), "utf8")).length === 0) {
    return [`${TABLE} : INTERNAL_OBJECT_PREFIXES illisible.`];
  }
  if (!existsSync(join(root, SPEC))) return [`${SPEC} introuvable : aucun préfixe n'est rejoué.`];
  return specViolations(readFileSync(join(root, SPEC), "utf8")).map((f) => `${SPEC} ${f}.`);
}

function ruleD(root) {
  const failures = tsconfigViolations(readFileSync(join(root, CONTAINER_TSCONFIG), "utf8"));
  const tsc = createRequire(join(root, "apps/lfd-api/package.json")).resolve("typescript/bin/tsc");
  const run = spawnSync(process.execPath, [tsc, "--noEmit", "-p", CONTAINER_TSCONFIG], {
    cwd: root,
    encoding: "utf8",
  });
  if (run.status !== 0)
    failures.push(`tsc -p ${CONTAINER_TSCONFIG} échoue :\n${run.stdout}${run.stderr}`);
  return failures;
}

function main() {
  const root = process.cwd();
  const a = ruleA(root);
  const failures = [...a.failures, ...ruleB(root), ...ruleC(root), ...ruleD(root)];
  if (failures.length > 0) {
    console.error("✗ lint:internal-objects-door — un seul chemin vers les objets partagés\n");
    for (const failure of failures) console.error(`  · ${failure}`);
    process.exit(1);
  }
  console.log(
    `✓ lint:internal-objects-door — ${a.adapters} adaptateurs par uncachedInternalCall, objets par withNoStore, préfixes rejoués, contrat du Worker compilé.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

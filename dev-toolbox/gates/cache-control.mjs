#!/usr/bin/env node
/**
 * Gate : **aucune réponse de l'API ne s'offre à un cache partagé**, sauf
 * décision écrite (plan `documentation/caching-usage/plan-aucun-cache-sur-le-personnel.md`).
 *
 * Le middleware `cacheControlByDefault` pose `private, no-store` (appelant
 * identifié) ou `private, no-cache` (visiteur) sur toute réponse. Une route
 * peut le remplacer — c'est là que la règle se perd : une réponse
 * `max-age=600`, même sans le mot `public`, se garde dans un cache partagé
 * dès que la requête ne porte pas d'`Authorization` (RFC 9111). D'où :
 *
 * - toute écriture de `Cache-Control` dans `apps/lfd-api/src` (chaîne,
 *   gabarit ou constante, quelle que soit la méthode qui l'écrit) doit
 *   contenir `private` ou `no-store`, sauf si sa valeur vient d'un fichier de
 *   la liste admise ;
 * - une écriture que la porte ne sait pas lire échoue : une porte qui se tait
 *   sur ce qu'elle ne comprend pas ne garantit rien ;
 * - `caches.default` et `caches.open` sont refusés dans `gateway/src` : la
 *   passerelle est le seul endroit où un cache partagé de l'API peut naître.
 *
 * Les tests ne sont pas lus. Usage : `pnpm lint:cache-control` (branché dans
 * `lint:gates`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const API_ROOT = "apps/lfd-api/src";
const GATEWAY_ROOT = "gateway/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "client", "coverage", ".turbo", "__tests__"]);

/** Les fichiers dont une valeur peut s'offrir à un cache partagé, chacun pour sa raison. */
const ADMITTED = new Map([
  [
    "apps/lfd-api/src/b2b/shop-copy/http/shop-copy-cache-headers.ts",
    "les textes publiés de la boutique, identiques pour tous, étiquetés par version et langue",
  ],
]);

/** Une valeur qui ferme le cache partagé. */
const CLOSED = /\b(?:private|no-store)\b/u;

/** Commentaires retirés, lignes jointes : prettier coupe un appel sur plusieurs lignes. */
function flatten(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/\s+/gu, " ");
}

/**
 * Lit l'expression d'une valeur à partir de `start`, jusqu'au premier `,`,
 * `)`, `;` ou `}` hors d'une chaîne ; d'une ternaire, seules les deux
 * branches comptent. Rend les morceaux : `{ literal }` ou
 * `{ identifier }`, ou `null` si l'expression contient autre chose (un appel,
 * une concaténation calculée) — illisible.
 */
export function readValue(code, start) {
  const parts = [];
  let index = start;
  while (index < code.length) {
    const char = code[index];
    if (char === "?") {
      // Une ternaire : ce qui précède est la condition, pas une valeur.
      parts.length = 0;
      index += 1;
      continue;
    }
    if (char === " " || char === ":") {
      index += 1;
      continue;
    }
    if (char === "," || char === ")" || char === ";" || char === "}") {
      break;
    }
    if (char === '"' || char === "'" || char === "`") {
      const end = code.indexOf(char, index + 1);
      if (end === -1) {
        return null;
      }
      parts.push({ literal: code.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    const identifier = /^[A-Za-z_$][\w$]*/u.exec(code.slice(index));
    if (identifier === null) {
      return null;
    }
    parts.push({ identifier: identifier[0] });
    index += identifier[0].length;
  }
  return parts.length === 0 ? null : parts;
}

/** Les constantes chaîne d'un source : `const NOM = "…"` ou un gabarit. */
export function constantsOf(source) {
  const found = new Map();
  const pattern = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(["'`])([^"'`]*)\2/gu;
  for (const match of flatten(source).matchAll(pattern)) {
    found.set(match[1], match[3]);
  }
  return found;
}

/**
 * Les écritures de `Cache-Control` d'un source : le nom de l'en-tête entre
 * guillemets, suivi d'une virgule (argument) ou de deux-points (clé d'objet),
 * puis la valeur. `unreadable` compte les mentions de l'en-tête (son nom seul
 * entre guillemets) qui ne sont
 * pas une écriture reconnue.
 */
export function writesOf(source) {
  const code = flatten(source);
  const writes = [];
  let recognised = 0;
  const pattern = /(["'`])cache-control\1\s*[,:]\s*/giu;
  for (const match of code.matchAll(pattern)) {
    recognised += 1;
    writes.push(readValue(code, match.index + match[0].length));
  }
  // Le nom de l'en-tête entre guillemets, seul : un chemin d'import qui le
  // contient (`cache-control-by-default.middleware.js`) n'en est pas une mention.
  const mentions = (code.match(/(["'`])cache-control\1/giu) ?? []).length;
  return { writes, unreadable: mentions - recognised };
}

/**
 * Juge une écriture : `null` si elle ferme le cache partagé ou vient d'un
 * fichier admis, sinon la raison du refus.
 */
export function verdictOf(rel, value, constants) {
  if (value === null) {
    return "valeur illisible (calculée) : écrivez une chaîne ou une constante";
  }
  for (const part of value) {
    if (part.literal !== undefined) {
      if (!CLOSED.test(part.literal) && !ADMITTED.has(rel)) {
        return `« ${part.literal} » n'est ni private ni no-store`;
      }
      continue;
    }
    const definition = constants.get(part.identifier);
    if (definition === undefined) {
      return `la constante ${part.identifier} est introuvable`;
    }
    if (!CLOSED.test(definition.value) && !ADMITTED.has(definition.rel)) {
      return `${part.identifier} (« ${definition.value} ») n'est ni private ni no-store`;
    }
  }
  return null;
}

/** Les caches de la passerelle : refusés tant qu'aucun n'est décidé. */
export function gatewayCachesOf(source) {
  return (flatten(source).match(/\bcaches\s*\.\s*(?:default|open)\b/gu) ?? []).length;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

const unix = (path) => path.split("\\").join("/");

/**
 * Le détecteur, éprouvé à chaque exécution. Une porte dont le motif s'est
 * cassé ne refuse plus rien, et le dit en vert.
 */
function selfCheck() {
  const ROUTE = "apps/lfd-api/src/b2b/x/http/x.controller.ts";
  const ADMITTED_FILE = [...ADMITTED.keys()][0];
  const constants = new Map([
    ["OPEN", { value: "public, max-age=60", rel: ROUTE }],
    ["COPY", { value: "public, max-age=60", rel: ADMITTED_FILE }],
    ["SHUT", { value: "private, no-store", rel: ROUTE }],
  ]);
  const judge = (source) =>
    writesOf(source).writes.map((value) => verdictOf(ROUTE, value, constants));
  const cases = [
    ['@Header("Cache-Control", "public, max-age=60")', 1],
    ['res.setHeader("cache-control", "max-age=600")', 1],
    ["res.set({ 'Cache-Control': 's-maxage=60' })", 1],
    ['res.header("Cache-Control", `max-age=${AGE}`)', 1],
    ['res.setHeader(\n  "Cache-Control",\n  OPEN,\n)', 1],
    ['res.setHeader("Cache-Control", pick())', 1],
    ['res.setHeader("Cache-Control", MISSING)', 1],
    ['@Header("Cache-Control", "no-store")', 0],
    ['res.setHeader("Cache-Control", "private, max-age=31536000, immutable")', 0],
    ['res.setHeader("Cache-Control", ok ? SHUT : "private, no-cache")', 0],
    ['res.setHeader("Cache-Control", COPY)', 0],
    ['// res.setHeader("Cache-Control", "public")', 0],
  ];
  const broken = cases.filter(
    ([source, expected]) => judge(source).filter((verdict) => verdict !== null).length !== expected,
  );
  const unreadable = writesOf(
    'import { x } from "./cache-control-by-default.js"; headers["Cache-Control"] = v;',
  ).unreadable;
  const gateway = gatewayCachesOf("const c = await caches.open('x'); caches.default.match(r);");
  if (broken.length > 0 || unreadable !== 1 || gateway !== 2) {
    console.error("✗ cache-control : le détecteur se trompe sur ses cas témoins :");
    for (const [source] of broken) {
      console.error(`    ${source}`);
    }
    if (unreadable !== 1) {
      console.error(`    une mention non reconnue comptée ${String(unreadable)} fois au lieu de 1`);
    }
    if (gateway !== 2) {
      console.error(`    caches de passerelle comptés ${String(gateway)} fois au lieu de 2`);
    }
    process.exit(1);
  }
}

selfCheck();

for (const required of [API_ROOT, GATEWAY_ROOT]) {
  if (!statSync(join(ROOT, required), { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`✗ cache-control : ${required} introuvable.`);
    process.exit(1);
  }
}
for (const admitted of ADMITTED.keys()) {
  if (!statSync(join(ROOT, admitted), { throwIfNoEntry: false })?.isFile()) {
    console.error(
      `✗ cache-control : le fichier admis ${admitted} a disparu — retirez-le de la liste.`,
    );
    process.exit(1);
  }
}

const apiFiles = sourceFiles(join(ROOT, API_ROOT)).map((file) => ({
  rel: unix(relative(ROOT, file)),
  source: readFileSync(file, "utf8"),
}));

const constants = new Map();
for (const { rel, source } of apiFiles) {
  for (const [name, value] of constantsOf(source)) {
    constants.set(name, { value, rel });
  }
}

const offenders = [];
let writeCount = 0;
for (const { rel, source } of apiFiles) {
  const { writes, unreadable } = writesOf(source);
  writeCount += writes.length;
  for (const value of writes) {
    const verdict = verdictOf(rel, value, constants);
    if (verdict !== null) {
      offenders.push(`${rel}\n    ${verdict}`);
    }
  }
  if (unreadable > 0) {
    offenders.push(
      `${rel}\n    ${String(unreadable)} mention(s) de Cache-Control que la porte ne sait pas lire`,
    );
  }
}

for (const file of sourceFiles(join(ROOT, GATEWAY_ROOT))) {
  const rel = unix(relative(ROOT, file));
  if (gatewayCachesOf(readFileSync(file, "utf8")) > 0) {
    offenders.push(
      `${rel}\n    ouvre un cache dans la passerelle — un cache partagé de l'API se décide, il ne s'ajoute pas`,
    );
  }
}

if (offenders.length > 0) {
  for (const offender of offenders) {
    console.error(`✗ ${offender}`);
  }
  console.error(
    "\n  Une réponse qui n'est ni `private` ni `no-store` peut se garder dans un cache\n" +
      "  partagé et servir un appelant à un autre (plan-aucun-cache-sur-le-personnel.md).\n" +
      "  Une exception se décide, avec sa raison, dans la liste ADMITTED de la porte.\n",
  );
  process.exit(1);
}

console.log(
  `✓ cache-control : ${String(writeCount)} écriture(s) de Cache-Control, toutes fermées au cache partagé ` +
    `sauf ${String(ADMITTED.size)} fichier(s) admis ; aucun cache dans la passerelle.`,
);

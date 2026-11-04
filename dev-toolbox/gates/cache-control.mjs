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
 *   passerelle est le seul endroit où un cache partagé de l'API peut naître ;
 * - depuis le 2026-11-04 (lot C3, `documentation/pricing/moteur/plan-cache-du-catalogue.md`
 *   § 7), Workers Cache garde toute réponse `public` du Worker de l'API. D'où :
 *   un fichier admis peut nommer ses LECTEURS, et tout autre fichier qui
 *   l'importe est refusé — `public` ne s'étend pas à une route de plus par un
 *   import ; les routes publiques du rayon ne lisent jamais l'appelant (aucun
 *   décorateur ni type d'identité dans leurs fichiers) ; et
 *   `apps/lfd-api/container/` est lu aussi — ni `Cache-Control` ouvert, ni
 *   `caches.*`, et la purge de Workers Cache, le gestionnaire de sortie et
 *   une classe de Durable Object n'y vivent que dans les fichiers admis.
 *
 * Les tests ne sont pas lus. Usage : `pnpm lint:cache-control` (branché dans
 * `lint:gates`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const API_ROOT = "apps/lfd-api/src";
const CONTAINER_ROOT = "apps/lfd-api/container";
const GATEWAY_ROOT = "gateway/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "client", "coverage", ".turbo", "__tests__"]);

/**
 * Les fichiers dont une valeur peut s'offrir à un cache partagé, chacun pour
 * sa raison et depuis sa date. `readers` : les SEULS fichiers qui peuvent
 * l'importer (absent = sans restriction, l'état d'avant le 2026-11-04).
 */
const ADMITTED = new Map([
  [
    "apps/lfd-api/src/b2b/shop-copy/http/shop-copy-cache-headers.ts",
    {
      since: "2026-11-02",
      reason:
        "les textes publiés de la boutique, identiques pour tous, étiquetés par version et langue ; " +
        "purgés de Workers Cache à chaque publication (`Cache-Tag: textes-boutique`, 2026-11-04)",
      readers: ["apps/lfd-api/src/b2b/shop-copy/http/shop-copy.controller.ts"],
    },
  ],
  [
    "apps/lfd-api/src/b2b/catalog/http/public-shelf-cache-headers.ts",
    {
      since: "2026-11-04",
      reason:
        "le rayon public (C3) : `public, max-age=30` sur deux routes qui ne lisent jamais l'appelant, " +
        "seulement si le drapeau public est allumé et que la version n'a pas bougé",
      readers: [
        "apps/lfd-api/src/b2b/catalog/http/shop-catalogue.controller.ts",
        "apps/lfd-api/src/b2b/catalog/http/shop-featured.controller.ts",
      ],
    },
  ],
]);

/**
 * Les fichiers des routes publiques du rayon et de ce qu'elles calculent :
 * `public` n'y est juste que tant qu'ils ne lisent pas l'appelant.
 */
const CALLER_BLIND = [
  "apps/lfd-api/src/b2b/catalog/http/shop-catalogue.controller.ts",
  "apps/lfd-api/src/b2b/catalog/http/shop-featured.controller.ts",
  "apps/lfd-api/src/b2b/catalog/application/queries/read-public-shop-catalogue.handler.ts",
  "apps/lfd-api/src/b2b/catalog/application/queries/read-public-shop-featured.handler.ts",
  "apps/lfd-api/src/b2b/catalog/application/queries/read-shop-catalogue.ts",
  "apps/lfd-api/src/b2b/catalog/application/queries/read-shop-featured.handler.ts",
];

/** Ce qui lit l'appelant : un décorateur d'identité, la requête brute, un type d'identité. */
const CALLER_READS =
  /\b(?:CurrentUser|ActingCompany|StaffUserId|StaffPermissions|Principal|RequestContext)\b|@(?:Req|Request|Headers)\s*\(|\bauthorization\b/giu;

/**
 * Dans `apps/lfd-api/container/` : ce qui ne vit que dans un fichier admis,
 * daté (2026-11-04, C3). La purge de Workers Cache — seul le point d'entrée
 * qui garde les réponses peut la faire ; le gestionnaire de sortie — le seul
 * chemin du conteneur vers l'objet ; une classe de Durable Object — un
 * magasin de rayons de plus se décide.
 */
const CONTAINER_ADMITTED = [
  {
    pattern: /\.cache\s*\??\.\s*purge\s*\(/gu,
    what: "une purge de Workers Cache",
    files: ["apps/lfd-api/container/worker.ts"],
  },
  {
    pattern: /\boutboundByHost\b/gu,
    what: "un gestionnaire de sortie",
    files: ["apps/lfd-api/container/worker.ts"],
  },
  {
    pattern: /\bextends\s+DurableObject\b/gu,
    what: "une classe de Durable Object",
    files: ["apps/lfd-api/container/pro-shelves.ts"],
  },
];

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

/** Les lectures de l'appelant dans un source (commentaires retirés). */
export function callerReadsOf(source) {
  return flatten(source).match(CALLER_READS) ?? [];
}

/** Le fichier admis qu'un source importe, par son nom (`./x-cache-headers.js`). */
export function importsOf(source, rel) {
  const base = rel.split("/").at(-1).replace(/\.ts$/u, "");
  return new RegExp(`from\\s*["'][^"']*/${base}(?:\\.js)?["']`, "u").test(flatten(source));
}

/** Les occurrences d'un motif réservé à des fichiers admis. */
export function reservedUsesOf(source, pattern) {
  return (flatten(source).match(pattern) ?? []).length;
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
  const SHELF_HEADERS = "apps/lfd-api/src/b2b/catalog/http/public-shelf-cache-headers.ts";
  const imported = [
    importsOf('import { offerPublicShelf } from "./public-shelf-cache-headers.js";', SHELF_HEADERS),
    importsOf(
      'import {\n  offerPublicShelf,\n} from "../http/public-shelf-cache-headers.js";',
      SHELF_HEADERS,
    ),
    importsOf('// from "./public-shelf-cache-headers.js"', SHELF_HEADERS),
    importsOf('import { x } from "./other-public-shelf-cache-headers.js";', SHELF_HEADERS),
  ];
  const caller = [
    callerReadsOf("read(@CurrentUser() user: Principal)").length,
    callerReadsOf("read(@ActingCompany() companyId: string)").length,
    callerReadsOf("read(@Req() req: Request)").length,
    callerReadsOf('read(@Headers("authorization") token: string)').length,
    callerReadsOf("/** Ne lit jamais le Principal. */ read(@Query() q: string)").length,
  ];
  const purges = reservedUsesOf(
    "await ctx.cache.purge({ tags }); await ctx.cache?.purge({ tags });\n// ctx.cache.purge(",
    CONTAINER_ADMITTED[0].pattern,
  );
  const detectorOk =
    imported.join(",") === "true,true,false,false" &&
    caller.every((count, index) => (index === caller.length - 1 ? count === 0 : count > 0)) &&
    purges === 2;
  if (broken.length > 0 || unreadable !== 1 || gateway !== 2 || !detectorOk) {
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
    if (!detectorOk) {
      console.error(
        `    lecteurs, appelant ou purge mal détectés : imports ${imported.join(",")}, ` +
          `appelant ${caller.join(",")}, purges ${String(purges)}`,
      );
    }
    process.exit(1);
  }
}

selfCheck();

for (const required of [API_ROOT, CONTAINER_ROOT, GATEWAY_ROOT]) {
  if (!statSync(join(ROOT, required), { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`✗ cache-control : ${required} introuvable.`);
    process.exit(1);
  }
}
const declared = [
  ...ADMITTED.keys(),
  ...[...ADMITTED.values()].flatMap((entry) => entry.readers ?? []),
  ...CALLER_BLIND,
  ...CONTAINER_ADMITTED.flatMap((entry) => entry.files),
];
for (const admitted of declared) {
  if (!statSync(join(ROOT, admitted), { throwIfNoEntry: false })?.isFile()) {
    console.error(
      `✗ cache-control : le fichier admis ${admitted} a disparu — retirez-le de la liste.`,
    );
    process.exit(1);
  }
}

const read = (file) => ({ rel: unix(relative(ROOT, file)), source: readFileSync(file, "utf8") });
const apiFiles = sourceFiles(join(ROOT, API_ROOT)).map(read);
const containerFiles = sourceFiles(join(ROOT, CONTAINER_ROOT)).map(read);

const constants = new Map();
for (const { rel, source } of [...apiFiles, ...containerFiles]) {
  for (const [name, value] of constantsOf(source)) {
    constants.set(name, { value, rel });
  }
}

const offenders = [];
let writeCount = 0;
for (const { rel, source } of [...apiFiles, ...containerFiles]) {
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

for (const { rel, source } of apiFiles) {
  for (const [admitted, entry] of ADMITTED) {
    if (
      entry.readers !== undefined &&
      rel !== admitted &&
      !entry.readers.includes(rel) &&
      importsOf(source, admitted)
    ) {
      offenders.push(
        `${rel}\n    importe ${admitted}, réservé à ${entry.readers.join(", ")} — ` +
          "`public` ne s'étend pas à une route de plus par un import",
      );
    }
  }
}

const sources = new Map(apiFiles.map(({ rel, source }) => [rel, source]));
for (const rel of CALLER_BLIND) {
  const reads = callerReadsOf(sources.get(rel) ?? "");
  if (reads.length > 0) {
    offenders.push(
      `${rel}\n    lit l'appelant (${[...new Set(reads)].join(", ")}) — sa réponse est \`public\` : ` +
        "Workers Cache servirait un rayon personnel à tous",
    );
  }
}

for (const { rel, source } of containerFiles) {
  if (gatewayCachesOf(source) > 0) {
    offenders.push(
      `${rel}\n    ouvre le Cache API local (caches.*) — le rayon public passe par Workers Cache`,
    );
  }
  for (const { pattern, what, files } of CONTAINER_ADMITTED) {
    if (!files.includes(rel) && reservedUsesOf(source, pattern) > 0) {
      offenders.push(`${rel}\n    porte ${what}, réservé à ${files.join(", ")} (C3, 2026-11-04)`);
    }
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
    `sauf ${String(ADMITTED.size)} fichier(s) admis et leurs lecteurs ; ${String(CALLER_BLIND.length)} fichier(s) ` +
    "des routes publiques sans lecture de l'appelant ; container lu ; aucun cache dans la passerelle.",
);

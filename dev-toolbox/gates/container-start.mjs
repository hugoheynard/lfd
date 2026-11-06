#!/usr/bin/env node
/**
 * Gate : **un container qui intercepte ses sorties démarre quand même**
 * (`documentation/caching-usage/le-rayon-en-cache.md`, § 4 bis — Hugo,
 * 2026-11-04 : « la prod ne peut jamais tomber en panne »).
 *
 * Avec `@cloudflare/containers`, déclarer un gestionnaire de sortie
 * (`outboundByHost`, `outbound`, une liste d'hôtes permis…) fait poser une
 * interception AU DÉMARRAGE du container. Elle exige deux choses du Worker qui
 * le porte :
 *
 * - `ctx.exports`, que donne le drapeau `enable_ctx_exports` ou une date de
 *   compatibilité à partir du 2025-11-17 ;
 * - un `ContainerProxy` exporté par le point d'entrée du Worker.
 *
 * Sans l'une ou l'autre, le container **refuse de démarrer** — constaté en
 * local le 2026-11-04 (`wrangler dev`, conteneur d'essai : 500
 * « ctx.exports.ContainerProxy is undefined »). En production, c'est l'API
 * coupée, et le déploiement le détecte sans revenir en arrière. Aucun test, aucun
 * typecheck, aucun `wrangler deploy --dry-run` ne le voit : l'erreur ne se lève
 * qu'au démarrage d'une instance.
 *
 * Pour chaque Worker du dépôt qui déclare des `containers`, la porte lit son
 * point d'entrée : s'il utilise l'un des déclencheurs ci-dessous, les deux
 * prérequis doivent y être. Les déclencheurs sont ceux qui posent
 * `usingInterception` dans `@cloudflare/containers` 0.3.7 (vérifié le
 * 2026-11-04 dans `dist/lib/container.js`) ; une version neuve du paquet se
 * relit avant d'être adoptée.
 *
 * Commentaires retirés : une phrase qui parle d'`outboundByHost` n'en déclare
 * pas. Usage : `pnpm gate container-start` (branché dans `lint:gates`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();

/** Les Workers qui portent un container, avec leur fichier de configuration. */
const WORKERS = ["apps/lfd-api/wrangler.jsonc", "apps/lfd-route-planner/wrangler.jsonc"];

/** À partir de cette date, `ctx.exports` est actif sans drapeau. */
const CTX_EXPORTS_DEFAULT_DATE = "2025-11-17";

/**
 * Ce qui fait poser une interception au démarrage : les statiques de classe et
 * les méthodes d'instance de `Container` qui configurent les sorties.
 */
const TRIGGERS = [
  "outboundByHost",
  "outboundHandlers",
  "outboundProxies",
  "outboundProxy",
  "outbound",
  "setOutboundHandler",
  "setOutboundByHost",
  "setOutboundByHosts",
  "removeOutboundByHost",
  "setAllowedHosts",
  "setDeniedHosts",
  "allowHost",
  "denyHost",
  "removeAllowedHost",
  "removeDeniedHost",
  "allowedHosts",
  "deniedHosts",
];

/** Un déclencheur employé comme membre (`X.outbound =`, `this.allowHost(`, `static outbound`). */
const TRIGGER_USE = new RegExp(
  `(?:\\.|\\bstatic\\s+|\\boverride\\s+)(${TRIGGERS.join("|")})\\b`,
  "u",
);

/** L'export de `ContainerProxy` depuis le paquet, seul ou dans une liste. */
const PROXY_EXPORT =
  /export\s*\{[^}]*\bContainerProxy\b[^}]*\}\s*from\s*["']@cloudflare\/containers["']/u;

/** Retire commentaires de bloc et de ligne, sans toucher une URL dans une chaîne. */
export function withoutComments(source) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (quote !== null) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) {
        quote = null;
      }
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Le premier déclencheur employé par le source, ou `null`. */
export function interceptionTriggerOf(source) {
  return withoutComments(source).match(TRIGGER_USE)?.[1] ?? null;
}

/** Vrai si le source exporte `ContainerProxy` du paquet. */
export function exportsContainerProxy(source) {
  return PROXY_EXPORT.test(withoutComments(source));
}

/** Vrai si la configuration donne `ctx.exports`. */
export function hasCtxExports(config) {
  const flags = config.compatibility_flags ?? [];
  if (flags.includes("disable_ctx_exports")) {
    return false;
  }
  return (
    flags.includes("enable_ctx_exports") ||
    String(config.compatibility_date ?? "") >= CTX_EXPORTS_DEFAULT_DATE
  );
}

/** Ce qui manque à un Worker pour que son container démarre. */
export function startFailuresOf(source, config) {
  const trigger = interceptionTriggerOf(source);
  if (trigger === null) {
    return [];
  }
  const failures = [];
  if (!exportsContainerProxy(source)) {
    failures.push(
      `emploie « ${trigger} » mais n'exporte pas ContainerProxy : ` +
        `ajoutez \`export { ContainerProxy } from "@cloudflare/containers";\` au point d'entrée`,
    );
  }
  if (!hasCtxExports(config)) {
    failures.push(
      `emploie « ${trigger} » sans ctx.exports : ajoutez "enable_ctx_exports" à ` +
        `compatibility_flags (une date avancée changerait tout le Worker)`,
    );
  }
  return failures;
}

/** Le détecteur, éprouvé à chaque exécution : un motif cassé ne refuserait plus rien. */
function selfCheck() {
  const flagged = { compatibility_date: "2025-06-01", compatibility_flags: ["enable_ctx_exports"] };
  const bare = { compatibility_date: "2025-06-01" };
  const recent = { compatibility_date: "2026-01-01" };
  const proxy = 'export { ContainerProxy } from "@cloudflare/containers";\n';
  const handler = 'Backend.outboundByHost = { "x.interne": h };\n';
  const cases = [
    ["sans déclencheur", "export class Backend {}", bare, 0],
    ["déclencheur, tout présent", proxy + handler, flagged, 0],
    ["déclencheur, date récente", proxy + handler, recent, 0],
    ["sans ContainerProxy", handler, flagged, 1],
    ["sans ctx.exports", proxy + handler, bare, 1],
    ["sans les deux", handler, bare, 2],
    ["statique", "class B { static outbound = h }", flagged, 1],
    ["méthode", "await this.setAllowedHosts([])", flagged, 1],
    ["commentaire", "// Backend.outboundByHost = …", bare, 0],
    ["chaîne avec //", 'const u = "http://x"; ' + handler, bare, 2],
    [
      "drapeau désactivé",
      proxy + handler,
      { compatibility_date: "2026-01-01", compatibility_flags: ["disable_ctx_exports"] },
      1,
    ],
    [
      "export groupé",
      'export { Container, ContainerProxy } from "@cloudflare/containers";\n' + handler,
      flagged,
      0,
    ],
  ];
  return cases
    .filter(([, source, config, expected]) => startFailuresOf(source, config).length !== expected)
    .map(([name]) => `détecteur cassé sur le cas « ${name} »`);
}

function main() {
  const failures = selfCheck();
  for (const configPath of WORKERS) {
    const config = JSON.parse(
      withoutComments(readFileSync(join(ROOT, configPath), "utf8")).replace(/,(\s*[}\]])/gu, "$1"),
    );
    if (!Array.isArray(config.containers) || config.containers.length === 0) {
      failures.push(
        `${configPath} ne déclare plus de containers : retirez-le de la liste de la porte.`,
      );
      continue;
    }
    const entry = join(dirname(configPath), config.main);
    const source = readFileSync(join(ROOT, entry), "utf8");
    for (const failure of startFailuresOf(source, config)) {
      failures.push(`${entry} ${failure}.`);
    }
  }
  if (failures.length > 0) {
    console.error(
      "✗ lint:container-start — un container qui intercepte ses sorties doit pouvoir démarrer\n",
    );
    for (const failure of failures) {
      console.error(`  · ${failure}`);
    }
    process.exit(1);
  }
  console.log(
    `✓ lint:container-start — ${WORKERS.length} Workers à container : aucun ne peut être empêché de démarrer par une interception.`,
  );
}

main();

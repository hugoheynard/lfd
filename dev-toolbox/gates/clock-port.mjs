#!/usr/bin/env node
/**
 * Gate : le temps et l'aléa passent par un **port**, jamais par le mur.
 *
 * `CLAUDE.md` §3.2 l'écrit depuis des mois — « `new Date()` / `Date.now()`
 * interdits hors de l'adaptateur `Clock` », « `Math.random()` interdit pour
 * fabriquer un identifiant » — et **rien ne le tenait**. C'était de la prose,
 * c'est-à-dire le dernier barreau de l'échelle : inexprimable > refusé en base
 * > refusé par l'agrégat > porte CI > relecture.
 *
 * Ce que la relecture a laissé passer, et qui a motivé cette porte :
 *
 * - `order-line-pricing.service.ts` prenait l'instant au mur **sur le chemin
 *   qui facture**. Son commentaire expliquait soigneusement pourquoi l'instant
 *   n'était lu qu'une fois — sans voir qu'il était lu au mauvais endroit ;
 * - `floorViewFromRow` portait `now: Date = new Date()` en **paramètre par
 *   défaut**. Le pire des trois : un appelant qui l'oublie ne reçoit pas une
 *   erreur, il reçoit une réponse plausible ;
 * - le tableau de tarification repliait deux fois sur `?? new Date()`, donc
 *   deux lectures d'une même requête pouvaient voir deux instants.
 *
 * Le mécanisme n'est pas moral, il est arithmétique : un temps métier lu au mur
 * n'est **ni gelable en test, ni rejouable**. Un prix qu'on ne peut pas rejouer
 * à un instant nommé ne se défend pas devant le client qui le conteste.
 *
 * Usage : `pnpm lint:clock-port` (branché en CI et dans `lint:gates`).
 *
 * ⚠️ Cette porte est branchée dans le MÊME commit qui l'écrit — cf. l'avertissement
 * de `no-direct-env.mjs`, restée des mois sans tourner nulle part parce que sa
 * liste de dérogations n'avait pas suivi le dépôt.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "client", "coverage", ".turbo"]);

/** Le mur : l'heure et l'aléa lus sans passer par un port. */
const WALL = /\bnew\s+Date\s*\(\s*\)|\bDate\.now\s*\(\s*\)|\bMath\.random\s*\(\s*\)/u;

/**
 * Les seuls fichiers autorisés à toucher le mur, **et pourquoi**.
 *
 * Une dérogation sans raison écrite est une porte ouverte silencieuse. Le
 * critère de tri tient en une question : *est-ce que ce que je lis là est un
 * fait MÉTIER ?* Une durée mesurée, un horodatage de log et l'adaptateur
 * lui-même répondent non. Une date qu'on écrit en base, qu'on compare à une
 * fenêtre de validité ou qui décide d'un prix répondent oui — et n'ont rien à
 * faire ici.
 */
const ALLOWED = [
  // ── L'adaptateur, et la source qu'il sert ──────────────────────────────
  // `SystemClock` EST la traduction du port. L'interdire ici n'aurait aucun
  // sens : il faut bien que quelqu'un lise l'heure une fois.
  "src/platform/time/system-clock.ts",
  // Le middleware d'ingress GÈLE le `now` de la requête. C'est l'unique point
  // où le temps entre dans l'application, et c'est exactement ce que §3.2
  // décrit — pas une entorse, le mécanisme.
  "src/platform/context/request-context.middleware.ts",

  // ── Observabilité : ni écrit en base, ni comparé à du métier ───────────
  // Horodatage de ligne de journal technique.
  "src/platform/logging/recording-logger.ts",
  // Les sondes mesurent des DURÉES (`Date.now() - startedAt`). Une latence
  // n'est pas un fait métier : elle ne se rejoue pas, elle se mesure.
  "src/ops/probes/probe.port.ts",
  "src/ops/probes/postgres.probe.ts",
  "src/ops/probes/frontend.probe.ts",
  "src/ops/probes/external.probes.ts",

  // ── Péremption d'un jeton d'API sortante ──────────────────────────────
  // Cache interne du client Auth0 Management : la durée de vie d'un jeton que
  // NOUS ne délivrons pas et que rien ne persiste. Le geler en test
  // n'apprendrait rien — c'est le fournisseur qui décide.
  "src/platform/identity/auth0-management.client.ts",
];

function isAllowed(relPath) {
  const unix = relPath.split("\\").join("/");
  return ALLOWED.some((suffix) => unix.endsWith(suffix));
}

/** Commentaires et gabarits retirés : une porte qui lit la PROSE ne garde rien. */
function withoutNoise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/`[^`]*`/gu, "``");
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".spec.ts")) {
      return [];
    }
    // Les tests ont leur propre porte (`test-dates`) et leur propre remède
    // (`FixedClock`) : celle-ci vise le code qui tourne en production.
    return path.includes(`${"__tests__"}`) ? [] : [path];
  });
}

const root = join(ROOT, SCAN_ROOT);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`✗ clock-port : ${SCAN_ROOT} introuvable.`);
  process.exit(1);
}

const offences = [];
let scanned = 0;
for (const file of sourceFiles(root)) {
  scanned += 1;
  const rel = relative(ROOT, file);
  if (isAllowed(rel)) {
    continue;
  }
  const lines = withoutNoise(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    if (WALL.test(line)) {
      offences.push({ rel, line: index + 1, text: line.trim() });
    }
  });
}

if (offences.length > 0) {
  console.error(`✗ clock-port : ${offences.length} lecture(s) du mur hors adaptateur.\n`);
  for (const { rel, line, text } of offences) {
    console.error(`  ${rel}:${line}`);
    console.error(`      ${text.slice(0, 100)}`);
  }
  console.error(
    "\n  Le temps et l'aléa passent par un port (CLAUDE.md §3.2) :\n" +
      "    · temps métier    → injecter `Clock` et appeler `this.clock.now()`\n" +
      "    · identifiant     → injecter `IdGenerator` (ULID, triable par le temps)\n" +
      "    · durée mesurée   → si ce n'est vraiment PAS un fait métier, ajouter le\n" +
      "                        fichier à ALLOWED avec sa raison écrite.\n",
  );
  process.exit(1);
}

console.log(`✓ clock-port : les ${scanned} fichiers de production lisent le temps par le port.`);
console.log(
  `  Dérogations déclarées : ${ALLOWED.length} (adaptateur, ingress, sondes, log, jeton)`,
);

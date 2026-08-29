#!/usr/bin/env node
/**
 * Gate : un front ne DÉCLARE pas les types qui lui viennent de l'API.
 *
 * Une réponse d'API a une forme, et cette forme a un propriétaire : le paquet de
 * contrats. Quand un front la redéclare, il en fait une COPIE — et une copie ne
 * suit pas. Le backend ajoute un champ, le retire, change un `string` en
 * `string | null` : le front continue de compiler, tranquillement faux, jusqu'à
 * ce que l'écran affiche `undefined` en production. Le compilateur ne peut rien
 * dire, parce qu'on ne lui a jamais dit que les deux formes parlaient de la même
 * chose.
 *
 * D'où la règle : le paramètre de type d'un appel HTTP vient d'un paquet
 * `@lfd/*`, ou il ne vient pas.
 *
 * ── Ce qui est refusé ───────────────────────────────────────────────────────
 * - un type déclaré dans le front : `interface AdminCompany { … }` ;
 * - un objet anonyme : `this.http.post<{ id: string }>(…)` — une forme anonyme
 *   est une forme redéclarée, elle ne fait que se passer de nom.
 *
 * ── Ce qui est accepté ──────────────────────────────────────────────────────
 * - tout ce qui est importé d'un `@lfd/*` ;
 * - `void`, et un paramètre générique (`<T>`) dans un utilitaire.
 *
 * ── La dette ────────────────────────────────────────────────────────────────
 * 32 appels étaient hors règle le 2026-08-29, sur 131. Elle est DÉCLARÉE
 * ci-dessous plutôt que tolérée en silence : la porte compte, affiche le solde,
 * et refuse qu'il grandisse. Une dette qu'on voit rétrécit ; une dette qu'on
 * ignore devient la norme.
 *
 * Retirer une ligne d'ici demande de déplacer la forme dans `@lfd/contracts` et
 * de l'importer des deux côtés. C'est le travail, et il se fait un fichier à la
 * fois.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** La dette héritée, fichier par fichier. Ce nombre ne peut que DESCENDRE. */
const ALLOWANCE = {
  "apps/lfc-B2B-admin-frontend/src/app/comptes-clients/admin-companies.service.ts": 4,
  "apps/lfc-B2B-admin-frontend/src/app/pim/channels/shopify-channel-api.ts": 6,
};

const CALL = /\.(get|post|put|patch|delete)<\s*([^>;]+?)\s*>\s*\(/gu;
const IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](@lfd\/[^'"]+)['"]/gsu;
const LOCAL_IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/gsu;
const REEXPORT = /export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@lfd\/[^'"]+['"]/gsu;
/** Ni un type, ni une forme : rien à posséder. */
const NEUTRAL = new Set([
  "void",
  "unknown",
  "T",
  "Blob",
  "ArrayBuffer",
  "string",
  "number",
  "boolean",
]);

function frontFiles() {
  return execFileSync(
    "git",
    ["ls-files", "apps/lfc-B2B-admin-frontend/src", "apps/lfc-B2B-platform-frontend/src"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  )
    .split("\n")
    .filter((file) => file.endsWith(".ts"));
}

/** Les noms qu'un bloc d'import déclare, quel qu'en soit le module. */
function namesOf(block) {
  return block
    .split(",")
    .map((raw) =>
      raw
        .replace(/\btype\b/u, "")
        .split(" as ")
        .pop()
        ?.trim(),
    )
    .filter((name) => name !== undefined && name !== "");
}

/** Le fichier visé par un import relatif, ou `null` s'il est introuvable. */
function resolveLocal(from, specifier) {
  const base = join(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf8");
    }
  }
  return null;
}

/**
 * Les noms venant d'un paquet `@lfd/*` — directement, OU via un barrel local.
 *
 * Le second cas n'est pas une faveur : `pim/data/models.ts` ne fait que
 * `export type { AllergenReference } from "@lfd/pim-contracts"`. La forme vient
 * bien du contrat, elle passe seulement par la porte d'entrée du module. La
 * compter comme une dette accuserait un fichier IRRÉPROCHABLE — et une porte
 * qui crie au loup finit désactivée.
 *
 * UN SEUL niveau d'indirection, volontairement : au-delà on écrirait un
 * résolveur de modules, c'est-à-dire un compilateur. Un barrel de barrel n'existe
 * pas ici ; le jour où il existera, la porte le signalera à tort, et c'est ce
 * signal-là qui dira quoi faire.
 */
function ownedNames(source, file) {
  const names = new Set();
  for (const match of source.matchAll(IMPORT)) {
    for (const name of namesOf(match[1])) {
      names.add(name);
    }
  }
  for (const match of source.matchAll(LOCAL_IMPORT)) {
    const resolved = resolveLocal(file, match[2]);
    if (resolved === null) {
      continue;
    }
    const reexported = new Set();
    for (const hop of resolved.matchAll(REEXPORT)) {
      for (const name of namesOf(hop[1])) {
        reexported.add(name);
      }
    }
    for (const name of namesOf(match[1])) {
      if (reexported.has(name)) {
        names.add(name);
      }
    }
  }
  return names;
}

/**
 * Le `fetch` GLOBAL, qui contournerait tout ce qui précède.
 *
 * `HttpClient` porte un paramètre de type, donc une forme qu'on peut exiger.
 * `fetch` rend une `Response` : la forme n'apparaît qu'au `await res.json()`,
 * où elle vaut `any` — et un `as SomeShape` posé là n'est pas une vérification,
 * c'est une AFFIRMATION. La porte ci-dessus n'aurait plus rien à lire.
 *
 * Aucun front n'en utilise aujourd'hui (vérifié le 2026-08-29 : les trois
 * occurrences de `fetch(` sont une méthode privée qui porte ce nom). La règle
 * est donc PRÉVENTIVE — et c'est le bon moment pour la poser, tant qu'elle ne
 * coûte rien à personne.
 *
 * `\.` en tête est exclu pour laisser passer `this.fetch(…)` : un objet a le
 * droit de nommer une méthode comme il veut.
 */
const RAW_FETCH = /(^|[^.\w])fetch\s*\(/u;
/** `private async fetch(…)` DÉCLARE une méthode, il n'appelle pas le global. */
const FETCH_DECLARATION = /\b(async|function)\s+fetch\s*\(/u;

const offences = new Map();
const rawFetch = [];

for (const file of frontFiles()) {
  const source = readFileSync(file, "utf8");
  source.split("\n").forEach((line, index) => {
    if (
      RAW_FETCH.test(line) &&
      !FETCH_DECLARATION.test(line) &&
      !line.trimStart().startsWith("*")
    ) {
      rawFetch.push(`${file}:${String(index + 1)}`);
    }
  });
  const owned = ownedNames(source, file);
  for (const match of source.matchAll(CALL)) {
    const argument = match[2].trim();
    const base = argument
      .replace(/^readonly\s+/u, "")
      .split("|")[0]
      .replace(/\[\]/gu, "")
      .split("<")[0]
      .trim();
    if (NEUTRAL.has(base) || owned.has(base)) {
      continue;
    }
    offences.set(file, (offences.get(file) ?? 0) + 1);
  }
}

const problems = [];
for (const [file, count] of offences) {
  const allowed = ALLOWANCE[file] ?? 0;
  if (count > allowed) {
    problems.push(`  ${file}\n      ${count} appel(s) hors contrat, ${allowed} toléré(s)`);
  }
}
// Une tolérance devenue inutile doit DISPARAÎTRE : sinon la dette déclarée
// cesse de dire la dette réelle, et le solde affiché ment doucement.
for (const [file, allowed] of Object.entries(ALLOWANCE)) {
  const count = offences.get(file) ?? 0;
  if (count < allowed) {
    problems.push(
      `  ${file}\n      ${count} appel(s) hors contrat pour ${allowed} toléré(s) — baissez la tolérance`,
    );
  }
}

for (const where of rawFetch) {
  problems.push(
    `  ${where}\n      \`fetch\` global — passez par HttpClient, dont le type est vérifiable`,
  );
}

if (problems.length > 0) {
  console.error("\n✖ Types d'API déclarés hors des contrats :\n");
  console.error(problems.join("\n"));
  console.error(
    "\nLa forme d'une réponse appartient à `@lfd/contracts`. Redéclarée dans un\n" +
      "front, elle en devient une COPIE — et une copie ne suit pas : le backend\n" +
      "change, le front compile toujours, et l'écran affiche `undefined`.\n",
  );
  process.exit(1);
}

const debt = Object.values(ALLOWANCE).reduce((sum, count) => sum + count, 0);
console.log(
  `✓ api-types : les appels HTTP portent des types de contrat — ${String(debt)} dette(s) déclarée(s), en baisse seulement`,
);

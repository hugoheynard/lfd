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
import { readFileSync } from "node:fs";

/** La dette héritée, fichier par fichier. Ce nombre ne peut que DESCENDRE. */
const ALLOWANCE = {
  "apps/lfc-B2B-admin-frontend/src/app/admin/acces-en-attente/pending-access.service.ts": 3,
  "apps/lfc-B2B-admin-frontend/src/app/admin/staff-users/staff-users.service.ts": 1,
  "apps/lfc-B2B-admin-frontend/src/app/b2b/tarification/tarification.service.ts": 2,
  "apps/lfc-B2B-admin-frontend/src/app/commercial/tarification/templates.service.ts": 2,
  "apps/lfc-B2B-admin-frontend/src/app/comptes-clients/admin-companies.service.ts": 6,
  "apps/lfc-B2B-admin-frontend/src/app/fiche-client/mandat/mandates.service.ts": 1,
  "apps/lfc-B2B-admin-frontend/src/app/pim/catalogue/category-http-api.ts": 1,
  "apps/lfc-B2B-admin-frontend/src/app/pim/catalogue/product-http-api.ts": 1,
  "apps/lfc-B2B-admin-frontend/src/app/pim/catalogue/reference-api.ts": 1,
  "apps/lfc-B2B-admin-frontend/src/app/pim/catalogue/vat-rates/vat-http-api.ts": 1,
  "apps/lfc-B2B-admin-frontend/src/app/pim/channels/shopify-channel-api.ts": 6,
  "apps/lfc-B2B-admin-frontend/src/app/pim/points-of-sale/point-of-sale-http-api.ts": 2,
  "apps/lfc-B2B-platform-frontend/src/app/account/account.service.ts": 3,
  "apps/lfc-B2B-platform-frontend/src/app/legacy/commandes/subscriptions.service.ts": 1,
  "apps/lfc-B2B-platform-frontend/src/app/legacy/entreprises/support.service.ts": 1,
};

const CALL = /\.(get|post|put|patch|delete)<\s*([^>;]+?)\s*>\s*\(/gu;
const IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](@lfd\/[^'"]+)['"]/gsu;
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

/** Les noms importés d'un paquet `@lfd/*` — les seuls qu'un appel peut porter. */
function ownedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(IMPORT)) {
    for (const raw of match[1].split(",")) {
      const name = raw
        .replace(/\btype\b/u, "")
        .split(" as ")
        .pop()
        ?.trim();
      if (name) {
        names.add(name);
      }
    }
  }
  return names;
}

const offences = new Map();

for (const file of frontFiles()) {
  const source = readFileSync(file, "utf8");
  const owned = ownedNames(source);
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

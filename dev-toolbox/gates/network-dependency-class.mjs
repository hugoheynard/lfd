/**
 * Le classement des dépendances externes de l'API, pour la porte
 * `network-outside-transaction` (Hugo, 2026-11-06).
 *
 * Les motifs de la porte (`fetch(`, Stripe, S3…) ne reconnaissent que les
 * clients qu'on connaît. Une bibliothèque réseau ajoutée demain (axios, un
 * SDK Twilio…) n'en emprunterait aucun, et la garde ne serait jamais posée.
 * D'où : tout paquet externe importé par `apps/lfd-api/src` — modules
 * intégrés de Node (`node:*`) et paquets du monorepo (`@lfd/*`) compris —
 * est classé `network` ou `local` dans `lint/dependency-network-class.json`,
 * et un import (hors `import type`) d'un paquet `network` fait du fichier un
 * appel sortant.
 *
 * Une entrée `network` peut restreindre le réseau à certains noms
 * (`networkImports`) : `@lfd/storage` exporte le client S3 **et** des
 * utilitaires purs (`sanitiseFileName`) que trente contrôleurs importent
 * (relevé le 2026-11-06) ; `jose` vérifie un jeton en local et ne lit le
 * réseau que par `createRemoteJWKSet`. Sans liste, tout import non typé du
 * paquet compte ; avec, seuls ces noms — plus un `import * as`, un import
 * nu ou dynamique, qui atteignent tout.
 */
import { withoutComments } from "./mail-through-block.mjs";

export const CLASS_FILE = "lint/dependency-network-class.json";

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Le paquet d'un spécifieur : `@scope/nom`, `nom`, `node:module` — ou `null` s'il est relatif. */
export function packageOf(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Une clause d'import qui ne porte que des types (`type X`, `{ type A, type B }`). */
function typeOnly(clause) {
  const text = clause.trim();
  if (/^type\b/.test(text)) return true;
  const braces = /^\{([^}]*)\}$/.exec(text);
  if (braces === null) return false;
  const names = braces[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return names.length > 0 && names.every((name) => /^type\b/.test(name));
}

/** Les noms valeur d'une clause (`Def, { a, type B, c as d }`) ; `"*"` pour un espace de noms. */
function valueNames(clause) {
  const text = clause.trim();
  if (/\*/.test(text)) return ["*"];
  const names = [];
  const braces = /\{([^}]*)\}/.exec(text);
  const head = text
    .replace(/\{[^}]*\}/, "")
    .replace(/,/g, " ")
    .trim();
  if (head !== "") names.push("default");
  for (const raw of braces === null ? [] : braces[1].split(",")) {
    const name = raw.trim();
    if (name === "" || /^type\b/.test(name)) continue;
    names.push(name.split(/\s+as\s+/)[0].trim());
  }
  return names;
}

// La clause est bornée et ne traverse ni `=` ni `(` : sans quoi chaque
// `export const …` d'un gros fichier relit la suite jusqu'au prochain `;`.
const STATIC = /(?:^|[\n;])[ \t]*(import|export)\s+([^;'"=()]{0,2000}?)\s*from\s*["']([^"']+)["']/g;
const BARE = /(?:^|[\n;])\s*import\s*["']([^"']+)["']/g;
const DYNAMIC = /(?<![\w.$])(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Les imports externes d'une source, commentaires blanchis : `{ pkg, line, typeOnly, names }`. */
export function externalImports(raw) {
  const source = withoutComments(raw);
  const found = [];
  const push = (specifier, index, isType, names) => {
    const pkg = packageOf(specifier);
    if (pkg !== null) found.push({ pkg, line: lineOf(source, index), typeOnly: isType, names });
  };
  for (const m of source.matchAll(STATIC)) {
    push(m[3], m.index + m[0].indexOf(m[1]), typeOnly(m[2]), valueNames(m[2]));
  }
  for (const m of source.matchAll(BARE)) {
    push(m[1], m.index + m[0].indexOf("import"), false, ["*"]);
  }
  for (const m of source.matchAll(DYNAMIC)) push(m[1], m.index, false, ["*"]);
  return found.sort((a, b) => a.line - b.line);
}

/** Le premier import non typé qui atteint le réseau : ligne et nature, ou `null`. */
export function firstNetworkImport(raw, classes) {
  const reaches = ({ pkg, typeOnly: isType, names }) => {
    const entry = classes[pkg];
    if (isType || entry?.class !== "network") return false;
    const only = entry.networkImports;
    return only === undefined || names.some((name) => name === "*" || only.includes(name));
  };
  const hit = externalImports(raw).find(reaches);
  return hit === undefined ? null : { line: hit.line, name: `paquet réseau ${hit.pkg}` };
}

/** Les écarts du classement : paquet non classé, entrée morte, classe inconnue. */
export function classificationFailures(files, classes) {
  const failures = [];
  const used = new Set();
  const reported = new Set();
  for (const { path, source } of files) {
    for (const { pkg, line } of externalImports(source)) {
      used.add(pkg);
      if (pkg in classes || reported.has(`${pkg}|${path}`)) continue;
      reported.add(`${pkg}|${path}`);
      failures.push(
        `nouvelle dépendance \`${pkg}\` importée par ${path}:${line} : ` +
          `classe-la \`network\` ou \`local\` dans ${CLASS_FILE}`,
      );
    }
  }
  for (const [pkg, entry] of Object.entries(classes)) {
    if (entry.class !== "network" && entry.class !== "local") {
      failures.push(
        `${CLASS_FILE} : \`${pkg}\` porte la classe « ${entry.class} » — \`network\` ou \`local\` seulement`,
      );
    } else if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      failures.push(`${CLASS_FILE} : \`${pkg}\` n'a pas de raison — une phrase, en français`);
    } else if (!used.has(pkg)) {
      failures.push(
        `${CLASS_FILE} : \`${pkg}\` n'est plus importé par apps/lfd-api/src — retire l'entrée`,
      );
    }
  }
  return failures;
}

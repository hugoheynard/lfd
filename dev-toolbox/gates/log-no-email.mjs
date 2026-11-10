#!/usr/bin/env node
/**
 * Gate : **aucun journal n'écrit une adresse e-mail** (plan
 * `documentation/mail/plan-service-e-mails.md`, revue avec
 * Hugo, cas 6 ; décidé le 2026-11-06).
 *
 * Un journal de production est gardé hors du registre RGPD, sans durée : une
 * adresse qui y entre est une donnée personnelle qu'on n'a déclarée nulle
 * part. Le journal désigne la personne par un identifiant stable (le compte,
 * le contact) — la même règle que `auth0-id-readers` pour le `sub`.
 *
 * ## Ce que la porte refuse
 *
 * Un appel `logger.log|warn|error|debug|verbose(`, `console.*(` ou `log.*(`
 * (le journal injecté des paquets, `this.log.info(…)`) dont les
 * arguments interpolent ou passent un identifiant qui nomme une adresse :
 * dernier segment `email`, `to`, `recipient(s)`, `address(es)`, ou finissant
 * par `Email` (`input.email`, `${ownerEmail}`). `account.id` passe.
 *
 * ## Les fichiers admis
 *
 * `ADMITTED` : les adaptateurs d'identité de DÉVELOPPEMENT, qui ne tournent
 * jamais en production et dont le journal est l'unique sortie (le lien de mot
 * de passe factice s'y lit). Une entrée qui ne
 * journalise plus d'adresse échoue.
 *
 * Portée : `apps/lfd-api/src/**.ts` et `packages/<paquet>/src/**.ts` (depuis le
 * 2026-11-07 : `@lfd/mailer` journalisait l'adresse du destinataire, hors de
 * portée), hors `__tests__/` et `*.spec.ts`, commentaires blanchis.
 *
 * Usage : `pnpm gate log-no-email`. Tests :
 * `node --test dev-toolbox/__tests__/log-no-email.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { withoutComments } from "./mail-through-block.mjs";

const API_SRC = "apps/lfd-api/src";
const PACKAGES = "packages";

/** Les racines lues : l'API, et le `src/` de chaque paquet. */
export function sourceRoots(root) {
  const roots = [join(root, API_SRC)];
  for (const name of readdirSync(join(root, PACKAGES))) {
    const src = join(root, PACKAGES, name, "src");
    try {
      if (statSync(src).isDirectory()) roots.push(src);
    } catch {
      // un paquet sans `src/` n'a rien à lire
    }
  }
  return roots;
}

/** Fichiers admis, chacun avec sa raison (vérifié le 2026-11-06). */
export const ADMITTED = new Map([
  [
    "apps/lfd-api/src/lafoliecoffee/account/infrastructure/dev-customer-identity.ts",
    "identité de développement, jamais en production : le journal est sa seule sortie",
  ],
  [
    "apps/lfd-api/src/staff/invitations/dev-staff-identity.ts",
    "identité staff de développement, jamais en production",
  ],
]);

const LOG_CALL = /\b(?:logger|console|log)\s*\.\s*(?:log|warn|error|debug|verbose|info)\s*\(/g;
const ADDRESS =
  /\b(?:[A-Za-z_$][\w$]*\.)*(?:email|to|recipients?|address(?:es)?|[a-z][\w$]*Email)\b(?!\s*\()/;
const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Le texte des arguments d'un appel, de la parenthèse ouvrante à sa fermante. */
export function callArguments(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/** Le code qu'un argument EXÉCUTE : hors littéraux, plus le contenu des `${…}`. */
export function codeOf(args) {
  const parts = [];
  for (const m of args.matchAll(/\$\{([^}]*)\}/g)) parts.push(m[1]);
  parts.push(args.replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, " "));
  return parts.join(" ");
}

/** Les violations d'une source : `[{ line, snippet }]`. */
export function violationsIn(source) {
  const clean = withoutComments(source);
  const found = [];
  for (const m of clean.matchAll(LOG_CALL)) {
    const open = m.index + m[0].length - 1;
    const code = codeOf(callArguments(clean, open));
    const hit = code.match(ADDRESS);
    if (hit) found.push({ line: lineOf(clean, m.index), snippet: hit[0] });
  }
  return found;
}

function* tsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") yield* tsFiles(path);
    } else if (name.endsWith(".ts") && !name.endsWith(".spec.ts")) yield path;
  }
}

function main() {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const failures = [];
  for (const path of sourceRoots(root).flatMap((dir) => [...tsFiles(dir)])) {
    const file = relative(root, path);
    const hits = violationsIn(readFileSync(path, "utf8"));
    if (ADMITTED.has(file)) {
      if (hits.length === 0)
        failures.push(
          `${file} — inscrit dans ADMITTED mais ne journalise plus d'adresse : retirer l'entrée.`,
        );
      continue;
    }
    for (const { line, snippet } of hits) {
      failures.push(
        `${file}:${line} — le journal reçoit \`${snippet}\`, une adresse e-mail.\n` +
          `    Un journal de production est gardé hors du registre RGPD : désigner la personne par son identifiant (compte, contact).`,
      );
    }
  }
  if (failures.length > 0) {
    console.error(`✗ log-no-email : ${failures.length} journal(aux) écrivent une adresse.\n`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `✓ log-no-email : aucun journal n'écrit d'adresse (${ADMITTED.size} fichiers de dev admis).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

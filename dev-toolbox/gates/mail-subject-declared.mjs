#!/usr/bin/env node
/**
 * Gate : **hors du bloc `mail`, chaque demande d'e-mail dit son sujet** (plan
 * `documentation/mail/plan-sujet-des-e-mails.md`, règle 3 ; décidé le
 * 2026-11-08 après la contradiction de vitruve, objection S5).
 *
 * Une demande porte ce pour quoi elle part (`subjects: [{ type: "order", id }]`) :
 * c'est par là que la fiche d'une commande lit ses e-mails. Un envoyeur qui
 * l'oublie fait un e-mail que personne ne retrouvera depuis son objet.
 *
 * ## Ce que la porte lit
 *
 * Les fichiers de `apps/lfd-api/src/**.ts` hors de `src/mail/`, hors
 * `__tests__/` et `*.spec.ts`, qui INJECTENT la porte `Mail`
 * (`private readonly mail: Mail`). Elle ne lit pas le nom `mail.send` : une
 * enveloppe à arguments positionnels (`this.mail.send(fact.orderId)`, où
 * `mail` est un service métier) le porte aussi, et c'est le service derrière
 * elle qui appelle la vraie porte — c'est lui qu'il faut lire.
 *
 * ## Ce qu'elle refuse
 *
 * À chaque appel `<injection>.send(` ou `<injection>.sendAndAwaitReceipt(` :
 *
 * - un argument qui n'est pas un littéral objet (une variable, un appel) :
 *   on ne peut pas y lire la clé ;
 * - un littéral qui étale un objet à son premier niveau (`...demand`) : la
 *   clé pourrait venir de là, ou ne pas y être ;
 * - un littéral sans la clé `subjects` à son premier niveau. Une demande qui
 *   n'a vraiment pas d'objet le dit : `subjects: []`.
 *
 * ## La dette, et les admis
 *
 * - {@link DEBT} : les envoyeurs pas encore migrés, comptés à chaque
 *   exécution (relevé du 2026-11-08, lot E1). Un fichier inscrit qui ne
 *   fait plus d'écart échoue : retire-le, la dette ne fait que décroître. Un
 *   fichier NEUF qui fait un écart échoue.
 * - {@link ADMITTED} : les envoyeurs sans sujet, avec leur raison et leur
 *   date — une alerte d'équipe qui n'a vraiment pas d'objet. L'essai et la
 *   sonde vivent dans le bloc `mail`, hors de la portée. Une entrée qui
 *   n'injecte plus `Mail` échoue.
 *
 * Usage : `pnpm gate mail-subject-declared`. Tests :
 * `node --test dev-toolbox/__tests__/mail-subject-declared.test.mjs`.
 */
import { fileURLToPath } from "node:url";

import { sources } from "./mail-key-no-pii.mjs";
import { withoutComments } from "./mail-through-block.mjs";

const SRC = "apps/lfd-api/src";
const MAIL_BLOCK = `${SRC}/mail/`;
const SELF = "dev-toolbox/gates/mail-subject-declared.mjs";

/**
 * Les envoyeurs sans sujet, chacun avec sa raison et sa date. VIDE au
 * 2026-11-08 : l'essai et la sonde vivent dans le bloc `mail`, et les deux
 * alertes d'équipe relevées ont un objet (l'alerte de compte nomme une
 * société et une commande ; l'alerte de rendez-vous, un rendez-vous, type à
 * ajouter) — elles sont en dette, pas admises.
 */
export const ADMITTED = new Map();

/**
 * Les envoyeurs pas encore migrés (relevé du 2026-11-08, lot E1) : ils
 * passent à leur sujet au fil du lot E5 du plan.
 */
export const DEBT = new Set([
  `${SRC}/b2b/alerts/application/handlers/dispatch-alert-channels.service.ts`,
  `${SRC}/b2b/account/application/handlers/send-login-method-linked-mail.handler.ts`,
  `${SRC}/b2b/account/application/services/grant-account-access.service.ts`,
  `${SRC}/b2b/account/application/services/support-requested-mail.service.ts`,
  `${SRC}/b2b/account/infrastructure/auth0-customer-identity.ts`,
  `${SRC}/b2b/account/infrastructure/dev-customer-identity.ts`,
  `${SRC}/b2b/accounting/application/services/collection-notice-sender.ts`,
  `${SRC}/b2b/accounting/application/services/invoice-notice-sender.ts`,
  `${SRC}/b2b/contact/application/services/customer-request-mail.service.ts`,
  `${SRC}/b2b/growth/infrastructure/mail-appointment-booked-alert.ts`,
  `${SRC}/b2b/payments/application/commands/send-mandate.handler.ts`,
  `${SRC}/b2b/sub-account-notices/application/services/principal-notice.sender.ts`,
  `${SRC}/b2b/vitrine/application/services/vitrine-notice-dispatcher.ts`,
  `${SRC}/production/application/services/dossier-dispatch.service.ts`,
  `${SRC}/staff/directory/application/set-staff-status.handler.ts`,
  `${SRC}/staff/invitations/open-staff-access.service.ts`,
]);

const INJECTION =
  /\b(?:private|protected|public|readonly)\s+(?:readonly\s+)?(\w+)\s*:\s*Mail\b(?![\w.])/g;
const lineOf = (source, index) => source.slice(0, index).split("\n").length;
const escape = (name) => name.replace(/[$]/g, "\\$&");

/** Les noms sous lesquels un fichier injecte la porte `Mail`. */
export function injectedNames(source) {
  return [...new Set([...source.matchAll(INJECTION)].map((match) => match[1]))];
}

const OPEN = new Set(["{", "(", "["]);
const CLOSE = new Set(["}", ")", "]"]);

/** L'index qui suit la fin d'une chaîne ouverte en `start` (guillemets ou gabarit). */
function afterString(source, start) {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length && source[index] !== quote) {
    if (source[index] === "\\") index += 1;
    else if (quote === "`" && source.startsWith("${", index)) {
      index = afterBalanced(source, index + 1);
      continue;
    }
    index += 1;
  }
  return index + 1;
}

/** L'index qui suit le délimiteur fermant de celui ouvert en `start`. */
function afterBalanced(source, start) {
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      index = afterString(source, index);
      continue;
    }
    if (OPEN.has(char)) depth += 1;
    if (CLOSE.has(char)) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return index;
}

/** Le premier niveau d'un littéral objet ouvert en `start` : ses délimiteurs internes blanchis. */
function topLevelOf(source, start) {
  const end = afterBalanced(source, start);
  let flat = "";
  let index = start + 1;
  while (index < end - 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`" || OPEN.has(char)) {
      const next = OPEN.has(char) ? afterBalanced(source, index) : afterString(source, index);
      flat += " ".repeat(next - index);
      index = next;
      continue;
    }
    flat += char;
    index += 1;
  }
  return flat;
}

/**
 * L'écart d'un appel dont l'argument commence en `start`, ou `null` s'il
 * passe un littéral qui porte `subjects` sans rien étaler.
 */
export function defectOf(source, start) {
  const open = source.slice(start).search(/\S/);
  if (open < 0 || source[start + open] !== "{") {
    return "argument passé par variable — la clé `subjects` ne s'y lit pas : écris le littéral objet à l'appel";
  }
  const top = topLevelOf(source, start + open);
  if (/\.\.\./.test(top)) {
    return "objet étalé (`...`) dans la demande — écris ses clés à l'appel, `subjects` comprise";
  }
  if (!/(^|[\s,])subjects\s*[:,]|(^|[\s,])subjects\s*$/.test(top)) {
    return "demande sans `subjects` — nomme son objet (`subjects: [{ type: \"order\", id }]`), ou `subjects: []` s'il n'en a pas";
  }
  return null;
}

/** Les appels de la porte injectée dans une source, commentaires blanchis : ligne et écart. */
export function callsOf(raw) {
  const source = withoutComments(raw);
  const calls = [];
  for (const name of injectedNames(source)) {
    const call = new RegExp(
      `\\b${escape(name)}\\s*\\.\\s*(send|sendAndAwaitReceipt)\\s*(?:<[^>()]*>)?\\s*\\(`,
      "g",
    );
    for (const match of source.matchAll(call)) {
      const start = match.index + match[0].length;
      calls.push({
        line: lineOf(source, match.index),
        gesture: match[1],
        defect: defectOf(source, start),
      });
    }
  }
  return calls.sort((a, b) => a.line - b.line);
}

/** Le verdict, pur : les écarts, et la dette comptée. */
export function verdict(files, admitted = ADMITTED, debt = DEBT) {
  const failures = [];
  const owed = [];
  const injecting = new Set();
  let checked = 0;
  for (const { path, source } of files) {
    if (path.startsWith(MAIL_BLOCK)) continue;
    if (injectedNames(withoutComments(source)).length === 0) continue;
    injecting.add(path);
    if (admitted.has(path)) continue;
    const calls = callsOf(source);
    checked += calls.length;
    const defects = calls.filter((call) => call.defect !== null);
    if (debt.has(path)) {
      if (defects.length === 0) {
        failures.push(
          `${path}  inscrit en dette mais chaque demande dit son sujet — retire-le de DEBT (${SELF}) : la dette ne fait que décroître`,
        );
      } else {
        owed.push(path);
      }
      continue;
    }
    for (const { line, gesture, defect } of defects) {
      failures.push(`${path}:${line}  mail.${gesture} : ${defect}`);
    }
  }
  for (const path of debt) {
    if (!injecting.has(path)) {
      failures.push(
        `${path}  inscrit en dette mais n'injecte plus la porte Mail (ou a disparu) — retire-le de DEBT (${SELF})`,
      );
    }
  }
  for (const path of admitted.keys()) {
    if (!injecting.has(path)) {
      failures.push(
        `${path}  admis mais n'injecte plus la porte Mail (ou a disparu) — retire-le d'ADMITTED (${SELF})`,
      );
    }
  }
  return { failures, debt: owed, checked };
}

function main() {
  const files = sources(process.cwd());
  const { failures, debt, checked } = verdict(files);
  if (failures.length > 0) {
    console.error("\n✗ mail-subject-declared\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). Une demande d'e-mail dit ce pour quoi elle part ` +
        "(plan-sujet-des-e-mails.md, règle 3).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ mail-subject-declared : ${checked} demande(s) lue(s) hors du bloc mail ; ` +
      `${debt.length} envoyeur(s) sans sujet encore (dette datée du 2026-11-08) :`,
  );
  for (const path of debt) console.log(`    ${path}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

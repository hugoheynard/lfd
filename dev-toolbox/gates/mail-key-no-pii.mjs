#!/usr/bin/env node
/**
 * Gate : **aucune clé d'idempotence d'e-mail n'est construite avec une
 * adresse** (plan `documentation/editeur-de-contenu/plan-service-e-mails.md`,
 * revue avec Hugo, cas 4 ; décidé le 2026-11-06).
 *
 * Le bloc `mail` garde une clé un an (`mail.mail_request.idempotency_key`) :
 * une adresse dans la clé est une donnée personnelle rangée hors du registre
 * RGPD, et une clé qui suit l'adresse change avec elle. La clé désigne le
 * destinataire par un identifiant stable (le contact, la fiche, le compte).
 *
 * ## Ce que la porte refuse
 *
 * Dans un fichier qui appelle `mail.send(` ou `mail.sendAndAwaitReceipt(`,
 * toute expression `idempotencyKey: …` dont le code nomme une adresse :
 *
 * - un identifiant dont le dernier segment est `to`, `email`, `mail`,
 *   `recipient(s)`, `address(es)`, ou finit par `Email` (`recipient.email`,
 *   `${to}`, `ownerEmail`) — `recipient.id` passe : c'est un identifiant ;
 * - un `@` dans un littéral de la clé.
 *
 * Portée : `apps/lfd-api/src/**.ts`, hors `__tests__/` et `*.spec.ts`,
 * commentaires blanchis.
 *
 * Usage : `pnpm gate mail-key-no-pii`. Tests :
 * `node --test dev-toolbox/__tests__/mail-key-no-pii.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { withoutComments } from "./mail-through-block.mjs";

const SRC = "apps/lfd-api/src";

const MAIL_CALL = /\bmail\s*\.\s*(?:send|sendAndAwaitReceipt)\s*(?:<[^>]*>)?\s*\(/;
const KEY = /\bidempotencyKey\s*:/g;
const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/**
 * L'expression qui suit `idempotencyKey:` jusqu'à la virgule ou l'accolade
 * qui la ferme, découpée en CODE (hors littéraux, et `${…}`) et en TEXTE
 * (le contenu des littéraux).
 */
export function keyExpression(source, start) {
  const code = [];
  const text = [];
  const stack = [];
  let i = start;
  while (i < source.length) {
    const c = source[i];
    const top = stack[stack.length - 1];
    if (top === "`" || top === '"' || top === "'") {
      if (c === "\\") {
        text.push(source[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (c === top) {
        stack.pop();
      } else if (top === "`" && c === "$" && source[i + 1] === "{") {
        stack.push("${");
        i += 2;
        continue;
      } else {
        text.push(c);
      }
      i += 1;
      continue;
    }
    if (c === "`" || c === '"' || c === "'") {
      stack.push(c);
    } else if (c === "(" || c === "[" || c === "{") {
      stack.push(c);
    } else if (c === ")" || c === "]" || c === "}") {
      if (stack.length === 0) break;
      stack.pop();
    } else if (c === "," && stack.length === 0) {
      break;
    }
    if (!(top === undefined && (c === "`" || c === '"' || c === "'"))) code.push(c);
    i += 1;
  }
  return { code: code.join(""), text: text.join(""), end: i };
}

const PII_SEGMENT = /^(?:to|e?mail|emails|recipients?|address(?:es)?|\w*Email|\w*Address)$/i;
const CHAIN = /[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*/g;

/** Ce qu'une expression de clé nomme d'une adresse ; vide si rien. */
export function piiIn({ code, text }) {
  const found = [];
  for (const match of code.matchAll(CHAIN)) {
    const segments = match[0].split(/\s*\??\.\s*/);
    const last = segments[segments.length - 1];
    if (PII_SEGMENT.test(last)) found.push(match[0].replace(/\s+/g, ""));
  }
  if (text.includes("@")) found.push("« @ » littéral");
  return found;
}

/** Les clés d'e-mail d'une source qui nomment une adresse : ligne et ce qui est nommé. */
export function piiKeys(raw) {
  const source = withoutComments(raw);
  if (!MAIL_CALL.test(source)) return [];
  const out = [];
  for (const match of source.matchAll(KEY)) {
    const expression = keyExpression(source, match.index + match[0].length);
    const named = piiIn(expression);
    if (named.length > 0) out.push({ line: lineOf(source, match.index), named });
  }
  return out;
}

/** Le verdict, pur. */
export function verdict(files) {
  const failures = [];
  let keys = 0;
  for (const { path, source } of files) {
    const stripped = withoutComments(source);
    if (MAIL_CALL.test(stripped)) keys += [...stripped.matchAll(KEY)].length;
    for (const { line, named } of piiKeys(source)) {
      failures.push(
        `${path}:${line}  clé d'idempotence d'e-mail construite avec une adresse (${named.join(", ")}) — ` +
          "désigne le destinataire par son identifiant stable (le contact, la fiche, le compte) : " +
          "le bloc garde la clé un an, et une adresse n'a rien à y faire",
      );
    }
  }
  return { failures, keys };
}

export function typescriptFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...typescriptFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

export function sources(root) {
  return typescriptFiles(join(root, SRC)).map((full) => ({
    path: relative(root, full).replace(/\\/g, "/"),
    source: readFileSync(full, "utf8"),
  }));
}

function main() {
  const files = sources(process.cwd());
  const { failures, keys } = verdict(files);
  if (failures.length > 0) {
    console.error("\n✗ mail-key-no-pii\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} clé(s) à corriger (plan-service-e-mails.md, revue, cas 4).\n`,
    );
    process.exit(1);
  }
  console.log(
    `✓ mail-key-no-pii : ${files.length} fichier(s) lus, ${keys} clé(s) d'e-mail, aucune ne nomme une adresse.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

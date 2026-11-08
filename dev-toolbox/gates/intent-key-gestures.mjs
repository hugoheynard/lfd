#!/usr/bin/env node
/**
 * Gate : **un geste du staff qui envoie un e-mail porte la clé d'intention de
 * l'écran** (plan `documentation/mail/plan-service-e-mails.md`,
 * revue avec Hugo, cas 4 ; décidé le 2026-11-06).
 *
 * Ces gestes tiraient leur clé d'e-mail au hasard (`IdGenerator`, ou
 * l'instant) : un double clic envoyait deux e-mails et rejouait le geste.
 * L'écran fabrique désormais une clé par intention, l'envoie en en-tête
 * `Idempotency-Key`, et le serveur s'en sert comme identifiant du geste
 * (`OncePerIntent`).
 *
 * ## Ce que la porte refuse
 *
 * 1. Pour chaque geste de GESTURES : une classe Command sans champ
 *    `readonly intentKey: string` **obligatoire** dans son constructeur (le
 *    compilateur tient alors chaque appelant) ; un contrôleur qui la
 *    construit sans lire `@IntentKey()` ni lui passer `intentKey`.
 * 2. Partout : une clé d'e-mail (`idempotencyKey:` d'un fichier qui appelle
 *    `mail.send(` ou `mail.sendAndAwaitReceipt(`) tirée au hasard ou datée
 *    (`ids`, `.next()`, `clock`, `now()`, `randomUUID`, `Math.random`), hors
 *    RANDOM_ADMITTED — c'est la forme exacte du doublon d'origine. Le hasard
 *    se suit à travers les variables locales du fichier (`const k =
 *    \`x:${ids.next()}\``, puis `idempotencyKey: k`), de proche en proche :
 *    sans quoi un intermédiaire suffisait à le cacher (Hugo, 2026-11-07, après
 *    que la sonde de S8 a disparu de la porte en passant par `callKey`). Le
 *    suivi s'arrête au fichier : une clé reçue en paramètre n'est pas suivie.
 *
 * Usage : `pnpm gate intent-key-gestures`. Tests :
 * `node --test dev-toolbox/__tests__/intent-key-gestures.test.mjs`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { keyExpression, sources } from "./mail-key-no-pii.mjs";
import { withoutComments } from "./mail-through-block.mjs";

const SRC = "apps/lfd-api/src";

/** Les gestes du staff qui envoient un e-mail (relevés le 2026-11-06) : commande, classe, contrôleur. */
export const GESTURES = [
  [
    "b2b/account/application/commands/attach-account-holder.command.ts",
    "AttachAccountHolderCommand",
    "b2b/account/http/admin-companies.controller.ts",
  ],
  [
    "b2b/account/application/commands/create-company-by-staff.command.ts",
    "CreateCompanyByStaffCommand",
    "b2b/account/http/admin-companies.controller.ts",
  ],
  [
    "b2b/account/application/commands/invite-company-member.command.ts",
    "InviteCompanyMemberCommand",
    "b2b/account/http/admin-company-members.controller.ts",
  ],
  [
    "staff/directory/application/staff-user.commands.ts",
    "CreateStaffUserCommand",
    "staff/directory/http/admin-staff-users.controller.ts",
  ],
  [
    "staff/directory/application/staff-user.commands.ts",
    "InviteStaffUserCommand",
    "staff/directory/http/admin-staff-users.controller.ts",
  ],
  [
    "staff/directory/application/set-staff-status.command.ts",
    "SetStaffStatusCommand",
    "staff/directory/http/admin-staff-users.controller.ts",
  ],
  [
    "b2b/payments/application/commands/send-mandate.command.ts",
    "SendMandateCommand",
    "b2b/payments/http/admin-mandates.controller.ts",
  ],
  [
    "b2b/accounting/application/commands/resend-invoice-notice.command.ts",
    "ResendInvoiceNoticeCommand",
    "b2b/accounting/http/admin-issued-invoices.controller.ts",
  ],
  [
    "b2b/orders/application/commands/resend-order-payment-link.command.ts",
    "ResendOrderPaymentLinkCommand",
    "b2b/orders/http/admin-order-payment-links.controller.ts",
  ],
  [
    "mail/copy/application/commands/send-mail-copy-trial.command.ts",
    "SendMailCopyTrialCommand",
    "mail/copy/http/admin-mail-copy.controller.ts",
  ],
  [
    "mail/documents/application/commands/send-mail-document-trial.command.ts",
    "SendMailDocumentTrialCommand",
    "mail/documents/http/admin-mail-templates.controller.ts",
  ],
  [
    "mail/senders/application/commands/change-mail-sender.command.ts",
    "ChangeMailSenderCommand",
    "mail/senders/http/admin-mail-senders.controller.ts",
  ],
].map(([command, className, controller]) => ({
  command: `${SRC}/${command}`,
  className,
  controller: `${SRC}/${controller}`,
}));

/** Les clés d'e-mail tirées au hasard qui restent admises, chacune avec sa raison. */
export const RANDOM_ADMITTED = {
  [`${SRC}/mail/requests/application/check-mail-delivery.handler.ts`]:
    "2026-11-06 — la sonde de déploiement : chaque appel EST un essai neuf, aucun écran ne clique (la clé passe par `callKey`, suivie depuis le 2026-11-07)",
  [`${SRC}/b2b/account/infrastructure/auth0-customer-identity.ts`]:
    "2026-11-06 — « mot de passe oublié » du CLIENT, pas un geste du staff : hors du cas 4, signalé dans son rapport",
  [`${SRC}/b2b/account/infrastructure/dev-customer-identity.ts`]:
    "2026-11-06 — double de dev du même « mot de passe oublié » : même forme que l'adaptateur Auth0",
};

const MAIL_CALL = /\bmail\s*\.\s*(?:send|sendAndAwaitReceipt)\s*(?:<[^>]*>)?\s*\(/;
const KEY = /\bidempotencyKey\s*:/g;
const RANDOM = /\bids\b|\.next\s*\(|\bclock\b|\bnow\s*\(|randomUUID|Math\.random/;
const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Le corps du constructeur de la classe nommée, ou `null`. */
function constructorOf(source, className) {
  const head = new RegExp(`class\\s+${className}\\b[^{]*\\{`).exec(source);
  if (head === null) return null;
  const ctor = /constructor\s*\(/.exec(source.slice(head.index));
  if (ctor === null) return null;
  const start = head.index + ctor.index + ctor[0].length;
  const { end } = keyExpressionUntilClose(source, start);
  return { text: source.slice(start, end), line: lineOf(source, head.index) };
}

/** Jusqu'à la parenthèse qui ferme celle ouverte juste avant `start`. */
function keyExpressionUntilClose(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return { end: i };
      depth -= 1;
    }
  }
  return { end: source.length };
}

const REQUIRED_FIELD = /\breadonly\s+intentKey\s*:\s*string\s*[,)\n]/;

/** Les écarts d'un geste : sa commande et son contrôleur. */
export function gestureFailures(gesture, commandSource, controllerSource) {
  const failures = [];
  if (commandSource === null) {
    return [`${gesture.command}  introuvable — retire ce geste de GESTURES ou corrige son chemin`];
  }
  const ctor = constructorOf(withoutComments(commandSource), gesture.className);
  if (ctor === null) {
    failures.push(`${gesture.command}  classe ${gesture.className} introuvable`);
  } else if (!REQUIRED_FIELD.test(ctor.text)) {
    failures.push(
      `${gesture.command}:${ctor.line}  ${gesture.className} sans \`readonly intentKey: string\` obligatoire — ` +
        "ce geste envoie un e-mail : la clé d'intention de l'écran est son identifiant (revue de S2, cas 4)",
    );
  }
  if (controllerSource === null) {
    failures.push(`${gesture.controller}  introuvable`);
    return failures;
  }
  const controller = withoutComments(controllerSource);
  const built = new RegExp(`new\\s+${gesture.className}\\s*\\(`).exec(controller);
  if (built === null) {
    failures.push(
      `${gesture.controller}  ne construit pas ${gesture.className} — corrige GESTURES`,
    );
    return failures;
  }
  const args = controller.slice(
    built.index + built[0].length,
    keyExpressionUntilClose(controller, built.index + built[0].length).end,
  );
  if (!/@IntentKey\s*\(\s*\)/.test(controller) || !/\bintentKey\b/.test(args)) {
    failures.push(
      `${gesture.controller}:${lineOf(controller, built.index)}  ${gesture.className} construit sans la clé de ` +
        "la requête — lis-la par `@IntentKey() intentKey: string` (en-tête Idempotency-Key) et passe-la à la commande",
    );
  }
  return failures;
}

const DECLARATION = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=(?!=)/g;
const identifier = (name) => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`);

/**
 * Le texte d'un initialiseur : jusqu'au `;` de même profondeur, ou à la
 * parenthèse qui ferme l'englobante. Les chaînes sont sautées, le code des
 * `${…}` gardé — c'est lui qui peut tirer au hasard.
 */
export function initializerOf(source, start) {
  const out = [];
  const stack = [];
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    const top = stack[stack.length - 1];
    if (top === "`" || top === '"' || top === "'") {
      if (c === "\\") i += 1;
      else if (c === top) stack.pop();
      else if (top === "`" && c === "$" && source[i + 1] === "{") {
        stack.push("${");
        i += 1;
      }
      continue;
    }
    if (c === "`" || c === '"' || c === "'") stack.push(c);
    else if (c === "(" || c === "[" || c === "{") stack.push(c);
    else if (c === ")" || c === "]" || c === "}") {
      if (stack.length === 0) break;
      stack.pop();
    } else if (c === ";" && stack.length === 0) break;
    out.push(c);
  }
  return out.join("");
}

/**
 * Les variables locales dont la valeur est tirée au hasard ou datée, de proche
 * en proche : une variable initialisée depuis une variable tirée l'est aussi.
 */
export function randomVariables(source) {
  const declarations = [...source.matchAll(DECLARATION)].map((m) => ({
    name: m[1],
    code: initializerOf(source, m.index + m[0].length),
  }));
  const tainted = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const { name, code } of declarations) {
      if (tainted.has(name)) continue;
      if (RANDOM.test(code) || [...tainted].some((t) => identifier(t).test(code))) {
        tainted.add(name);
        grew = true;
      }
    }
  }
  return tainted;
}

/** Les clés d'e-mail tirées au hasard ou datées d'une source : lignes. */
export function randomKeys(raw) {
  const source = withoutComments(raw);
  if (!MAIL_CALL.test(source)) return [];
  const tainted = [...randomVariables(source)];
  const out = [];
  for (const match of source.matchAll(KEY)) {
    const { code } = keyExpression(source, match.index + match[0].length);
    if (RANDOM.test(code) || tainted.some((t) => identifier(t).test(code))) {
      out.push(lineOf(source, match.index));
    }
  }
  return out;
}

/** Le verdict, pur. `read(path)` rend la source ou `null`. */
export function verdict(gestures, read, files, admitted) {
  const failures = [];
  for (const gesture of gestures) {
    failures.push(...gestureFailures(gesture, read(gesture.command), read(gesture.controller)));
  }
  const seen = new Set();
  for (const { path, source } of files) {
    const lines = randomKeys(source);
    if (lines.length === 0) continue;
    seen.add(path);
    if (path in admitted) continue;
    for (const line of lines) {
      failures.push(
        `${path}:${line}  clé d'e-mail tirée au hasard ou datée — un double clic enverrait deux e-mails ; ` +
          "prends la clé d'intention du geste (`command.intentKey`), ou une clé déterministe du fait",
      );
    }
  }
  for (const path of Object.keys(admitted)) {
    if (!seen.has(path))
      failures.push(
        `${path}  admis mais ne tire plus de clé au hasard — retire-le de RANDOM_ADMITTED`,
      );
  }
  return failures;
}

function main() {
  const root = process.cwd();
  const read = (path) =>
    existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null;
  const files = sources(root);
  const failures = verdict(GESTURES, read, files, RANDOM_ADMITTED);
  if (failures.length > 0) {
    console.error("\n✗ intent-key-gestures\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(`\n  ${failures.length} écart(s) (plan-service-e-mails.md, revue, cas 4).\n`);
    process.exit(1);
  }
  console.log(
    `✓ intent-key-gestures : ${GESTURES.length} geste(s) du staff portent leur clé d'intention, ` +
      `aucune clé d'e-mail tirée au hasard hors ${Object.keys(RANDOM_ADMITTED).length} admise(s).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

#!/usr/bin/env node
/**
 * Gate : **un e-mail se demande au bloc `mail`** (plan
 * `documentation/editeur-de-contenu/plan-service-e-mails.md`, lot S1).
 *
 * Aujourd'hui chaque bloc qui envoie un e-mail injecte le mailer lui-même
 * (`MAILER`) : il choisit le gabarit, envoie, lit le résultat. Le bloc `mail`
 * déclare désormais sa porte, `MailRequests` (`mail/channels/requests/`) —
 * `request` dans la transaction, `sendNow` pour le résultat à l'écran. Le lot
 * S2 fera passer les envoyeurs par elle, bloc par bloc.
 *
 * ## Ce que la porte refuse
 *
 * Un fichier de `apps/lfd-api/src` qui injecte le mailer :
 * `@Inject(MAILER)`, ou `MAILER` dans la liste `inject: [...]` d'une fabrique.
 * Le transport, `MAIL_TRANSPORT`, compte de la même façon : l'injecter serait
 * contourner la porte ET le journal.
 *
 * ## Deux listes
 *
 * - **ADMITTED** : le bloc `mail` (c'est son travail), et le module du mailer,
 *   qui fabrique ce qu'il fournit.
 * - **DEBT** : les envoyeurs pas encore passés par la porte, relevés le
 *   2026-11-06 (31, le compte du plan, § 1). Un fichier hors des deux listes
 *   qui injecte le mailer échoue ; un fichier de la dette devenu propre échoue
 *   aussi, pour qu'on le raye. La liste ne grandit pas, elle se vide.
 *
 * Portée : `apps/lfd-api/src/**.ts`, hors `__tests__/` et `*.spec.ts`. Les
 * commentaires sont blanchis : ils citent le mailer pour l'expliquer.
 *
 * Usage : `pnpm lint:mail-through-block`. Tests :
 * `node --test dev-toolbox/__tests__/mail-through-block.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = "apps/lfd-api/src";

/** Ceux dont le travail EST l'envoi. Une entrée finissant par `/` couvre un dossier. */
export const ADMITTED = {
  [`${SRC}/mail/`]: "le bloc des e-mails : sa porte envoie par le mailer",
  [`${SRC}/platform/mailer/mailer.module.ts`]:
    "le module du mailer fabrique MAILER à partir de MAIL_TRANSPORT",
};

/**
 * Les envoyeurs qui injectent encore le mailer (relevés le 2026-11-06, lot S1).
 * En retirer un = l'avoir fait passer par `MailRequests` (lot S2). S2a a rayé
 * les 11 de `b2b/orders` (2026-11-06) : 20 restent.
 */
export const DEBT = [
  `${SRC}/b2b/account/application/handlers/mail-support-requested.handler.ts`,
  `${SRC}/b2b/account/application/handlers/send-login-method-linked-mail.handler.ts`,
  `${SRC}/b2b/account/application/services/grant-account-access.service.ts`,
  `${SRC}/b2b/account/infrastructure/auth0-customer-identity.ts`,
  `${SRC}/b2b/account/infrastructure/dev-customer-identity.ts`,
  `${SRC}/b2b/accounting/application/services/collection-notice-sender.ts`,
  `${SRC}/b2b/accounting/application/services/invoice-notice-sender.ts`,
  `${SRC}/b2b/alerts/application/handlers/dispatch-alert-channels.service.ts`,
  `${SRC}/b2b/contact/application/handlers/mail-customer-request.handler.ts`,
  `${SRC}/b2b/contact/application/handlers/mail-order-change-applied.handler.ts`,
  `${SRC}/b2b/contact/application/handlers/mail-order-change-refused.handler.ts`,
  `${SRC}/b2b/growth/infrastructure/mail-appointment-booked-alert.ts`,
  `${SRC}/b2b/mail-copy/infrastructure/specimen-mail-trial.sender.ts`,
  `${SRC}/b2b/payments/application/commands/send-mandate.handler.ts`,
  `${SRC}/b2b/sub-account-notices/application/services/principal-notice.sender.ts`,
  `${SRC}/b2b/vitrine/application/services/vitrine-notice-dispatcher.ts`,
  `${SRC}/platform/mailer/admin-mail-check.controller.ts`,
  `${SRC}/production/application/services/dossier-dispatch.service.ts`,
  `${SRC}/staff/directory/application/set-staff-status.handler.ts`,
  `${SRC}/staff/invitations/open-staff-access.service.ts`,
];

/** Les commentaires citent le mailer pour l'expliquer : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

const TOKENS = "(?:MAILER|MAIL_TRANSPORT)";
const RULES = [
  new RegExp(`@Inject\\(\\s*(${TOKENS})\\s*\\)`, "g"),
  new RegExp(`\\binject\\s*:\\s*\\[[^\\]]*?\\b(${TOKENS})\\b`, "g"),
];

/** Les injections d'une source : `[ligne, jeton]`. */
export function injectionsIn(raw) {
  const source = withoutComments(raw);
  const found = [];
  for (const pattern of RULES) {
    for (const match of source.matchAll(pattern)) {
      found.push([lineOf(source, match.index), match[1]]);
    }
  }
  return found.sort((a, b) => a[0] - b[0]);
}

function isAdmitted(path, admitted) {
  return Object.keys(admitted).some((entry) =>
    entry.endsWith("/") ? path.startsWith(entry) : path === entry,
  );
}

/** Le verdict, pur : ce qui échoue, et la dette restante. */
export function verdict(files, debt, admitted = {}) {
  const failures = [];
  const remaining = [];
  const indebted = new Set();
  for (const { path, source } of files) {
    const found = injectionsIn(source);
    if (found.length === 0 || isAdmitted(path, admitted)) continue;
    indebted.add(path);
    if (debt.includes(path)) {
      remaining.push(path);
      continue;
    }
    for (const [line, token] of found) {
      failures.push(
        `${path}:${line}  injecte ${token} — demander l'e-mail par \`MailRequests\` ` +
          "(mail/channels/requests/) ; la dette ne fait que décroître",
      );
    }
  }
  for (const path of debt) {
    if (!indebted.has(path)) {
      failures.push(`${path}  inscrit en dette mais propre (ou disparu) — le retirer de DEBT`);
    }
  }
  return { failures, remaining };
}

function typescriptFiles(dir) {
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

function main() {
  const root = process.cwd();
  const files = typescriptFiles(join(root, SRC)).map((full) => ({
    path: relative(root, full).replace(/\\/g, "/"),
    source: readFileSync(full, "utf8"),
  }));
  const { failures, remaining } = verdict(files, DEBT, ADMITTED);
  for (const entry of Object.keys(ADMITTED)) {
    try {
      statSync(join(root, entry));
    } catch {
      failures.push(`${entry}  admis mais introuvable — déplacé ? corriger ADMITTED`);
    }
  }
  if (failures.length > 0) {
    console.error("\n✗ mail-through-block\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). Un e-mail se demande au bloc \`mail\` ` +
        "(plan-service-e-mails.md, S1–S2).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ mail-through-block : ${files.length} fichier(s) lus, aucun envoyeur neuf hors du bloc.\n` +
      `  Dette : ${remaining.length} fichier(s) injectent encore le mailer — compté, pas ignoré.`,
  );
  for (const path of remaining) console.log(`    ${path}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

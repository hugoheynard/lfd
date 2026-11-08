#!/usr/bin/env node
/**
 * Gate : **un champ qui dit qu'un e-mail est « parti » nomme son étape**
 * (`documentation/mail/le-suivi-des-e-mails.md`, T4 ; revue du
 * service, cas 5, `documentation/mail/plan-service-e-mails.md`, décidé avec
 * Hugo le 2026-11-06).
 *
 * Un e-mail passe par trois étapes, et la porte `Mail` en rend deux :
 *
 * - **demandée** — `mail.send` rend `MailRequested` : la demande est écrite,
 *   rien n'est parti ;
 * - **acceptée** — `mail.sendAndAwaitReceipt` rend `MailAcceptance` : Resend
 *   l'a prise (ou le mailer tourne à blanc : `providerId` nul, pas acceptée) ;
 * - **remise / rebondie / spam** — `MailDelivery`, le retour du fournisseur,
 *   que seul le suivi du bloc connaît (T1).
 *
 * « `mailSent: true` » ne dit aucune des trois, et l'écran l'a lu comme
 * « il l'a reçu ». La porte tient les noms.
 *
 * ## Ce que la porte refuse
 *
 * 1. **Sans dette possible** : un champ d'étape (ancien ou nouveau nom) dont
 *    la valeur se lit dans « le mailer est configuré » (`configured`,
 *    `apiKey`, `dryRun`) — c'est un réglage, pas un envoi ; un champ
 *    `…Accepted` / `…Delivered` tiré de `mail.send(` — une demande enregistrée
 *    n'est pas une acceptation ; un champ `…Delivered` tiré de
 *    `sendAndAwaitReceipt(` — une acceptation n'est pas une remise.
 * 2. **En dette décroissante** : un ancien nom (`mailSent`, `emailSent`,
 *    `sent`, `notified`, `mailNotified`, `emailNotified`) déclaré ou servi
 *    comme champ. Le compte par fichier est inscrit dans DEBT ; un fichier
 *    hors liste qui en gagne un échoue, un compte qui baisse doit être
 *    abaissé dans DEBT, un fichier nettoyé qui reste inscrit échoue.
 *
 * Le nom d'étape attendu : `mailRequested`, `mailAccepted`, `mailDelivered`.
 *
 * Portée : ce que l'API sert — `packages/contracts/src/**`, et dans
 * `apps/lfd-api/src/**` tout ce qui n'est ni `domain/` ni `infrastructure/`
 * (vues, résultats de commande, réponses — `staff/invitations/` n'a pas de
 * dossier `application/`). Le domaine, l'infrastructure et le
 * client Prisma généré n'y sont pas : une colonne (`mailSent` de la vitrine)
 * est une valeur rangée, pas un nom servi — elle se renomme par migration.
 * Hors `__tests__/` et `*.spec.ts`. Commentaires blanchis. Un paramètre de
 * constructeur (`private readonly sent: …`) n'est pas un champ.
 *
 * Heuristique assumée : la valeur est lue sur la ligne du champ seulement ;
 * une variable intermédiaire n'est pas suivie.
 *
 * Usage : `pnpm gate mail-status-honest`. Tests :
 * `node --test dev-toolbox/__tests__/mail-status-honest.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { withoutComments } from "./mail-through-block.mjs";

const API = "apps/lfd-api/src";
const CONTRACTS = "packages/contracts/src";
const SELF = "dev-toolbox/gates/mail-status-honest.mjs";

/** Les anciens noms : ils ne disent pas l'étape. */
export const OLD_NAMES = [
  "mailSent",
  "emailSent",
  "sent",
  "notified",
  "mailNotified",
  "emailNotified",
];
const STAGE_NAMES = ["mailRequested", "mailAccepted", "mailDelivered"];

/**
 * La dette de départ, relevée le 2026-11-08 : chaque champ y dit l'étape
 * « acceptée » (`providerId !== null`, lu par `sendAndAwaitReceipt`) sous un
 * nom qui ne la nomme pas — sauf mention contraire. Un compte ne fait que
 * baisser.
 */
export const DEBT = {
  "apps/lfd-api/src/b2b/account/application/commands/attach-account-holder.handler.ts": {
    count: 2,
    reason: "2026-11-08 — rattachement du détenteur : mailSent servi = acceptée",
  },
  "apps/lfd-api/src/b2b/account/application/commands/create-company-by-staff.handler.ts": {
    count: 6,
    reason:
      "2026-11-08 — ouverture de compte : mailSent servi = acceptée (+ codec de rejeu d'intention)",
  },
  "apps/lfd-api/src/b2b/account/application/commands/invite-company-member.handler.ts": {
    count: 5,
    reason:
      "2026-11-08 — invitation d'un membre : mailSent servi = acceptée (+ codec de rejeu d'intention)",
  },
  "apps/lfd-api/src/b2b/account/application/services/grant-account-access.service.ts": {
    count: 2,
    reason: "2026-11-08 — ouverture d'accès : mailSent = providerId non nul",
  },
  "apps/lfd-api/src/b2b/vitrine/application/commands/sweep-vitrine.command.ts": {
    count: 1,
    reason: "2026-11-08 — bilan du balayeur de la vitrine : notified = avis acceptés",
  },
  "apps/lfd-api/src/b2b/vitrine/application/commands/sweep-vitrine.handler.ts": {
    count: 1,
    reason: "2026-11-08 — même bilan, son accumulateur",
  },
  "apps/lfd-api/src/mail/requests/application/check-mail-delivery.command.ts": {
    count: 1,
    reason: "2026-11-08 — sonde du déploiement : sent = les deux chemins acceptés",
  },
  "apps/lfd-api/src/mail/requests/application/check-mail-delivery.handler.ts": {
    count: 1,
    reason: "2026-11-08 — même sonde, sa réponse",
  },
  "apps/lfd-api/src/mail/requests/application/sweep-mail-requests.command.ts": {
    count: 1,
    reason:
      "2026-11-08 — bilan du balayeur : sent = demandes acceptées (le statut en base s'appelle `sent`)",
  },
  "apps/lfd-api/src/mail/requests/application/sweep-mail-requests.handler.ts": {
    count: 1,
    reason: "2026-11-08 — même bilan, son accumulateur",
  },
  "apps/lfd-api/src/ops/health/mail-readings.reader.ts": {
    count: 1,
    reason: "2026-11-08 — carte de santé : sent = état d'ops.mail_send, retiré en T1b",
  },
  "apps/lfd-api/src/ops/health/mail-readings.ts": {
    count: 1,
    reason: "2026-11-08 — même lecture, son type",
  },
  "apps/lfd-api/src/platform/intent/once-per-intent.ts": {
    count: 3,
    reason:
      "2026-11-08 — codec de rejeu : la clé `mailSent` est aussi une VALEUR rangée dans les intentions déjà écrites",
  },
  "apps/lfd-api/src/platform/mailer/journal/mail-journal.port.ts": {
    count: 1,
    reason: "2026-11-08 — journal ops.mail_send, retiré en T1b",
  },
  "apps/lfd-api/src/production/application/services/dossier-dispatch.service.ts": {
    count: 2,
    reason: "2026-11-08 — dossier du fournil : sent = destinataires acceptés",
  },
  "apps/lfd-api/src/staff/invitations/open-staff-access.service.ts": {
    count: 2,
    reason: "2026-11-08 — ouverture d'accès d'équipe : mailSent = providerId non nul",
  },
  "packages/contracts/src/admin-company.ts": {
    count: 2,
    reason:
      "2026-11-08 — CompanyOpened, HolderAttached : mailSent = acceptée, lu par le back-office",
  },
  "packages/contracts/src/company-member.ts": {
    count: 1,
    reason: "2026-11-08 — CompanyMemberInvitedView : mailSent = acceptée, lu par le back-office",
  },
  "packages/contracts/src/created.ts": {
    count: 1,
    reason: "2026-11-08 — InvitationSentResponse : mailSent = acceptée, lu par le back-office",
  },
  "packages/contracts/src/journal-facts/production-settings.ts": {
    count: 1,
    reason:
      "2026-11-08 — fait passé du dossier du fournil : `sent` est une clé de charge déjà écrite",
  },
  "packages/contracts/src/vitrine.ts": {
    count: 1,
    reason:
      "2026-11-08 — VitrineNoticeRecipientView : mailSent = acceptée ; colonne du même nom en base",
  },
};

const FIELD = new RegExp(
  `(^|[\\s{,(])(${[...OLD_NAMES, ...STAGE_NAMES].join("|")})\\??\\s*:`,
  "gm",
);
const PARAMETER = /\b(?:private|protected|public)\s+(?:readonly\s+)?$/;
const CONFIGURED = /\b\w*(?:[cC]onfigured|apiKey|ApiKey|dryRun|DryRun)\b/;
const DEFERRED_SEND = /\.send\s*(?:<[^>]*>)?\s*\(/;
const IMMEDIATE_SEND = /\bsendAndAwaitReceipt\s*(?:<[^>]*>)?\s*\(/;

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Les champs d'étape d'une source, commentaires blanchis : ligne, nom, et la valeur lue sur la ligne. */
export function stageFields(raw) {
  const source = withoutComments(raw);
  const found = [];
  for (const match of source.matchAll(FIELD)) {
    const start = match.index + match[1].length;
    const lineStart = source.lastIndexOf("\n", start) + 1;
    if (PARAMETER.test(source.slice(lineStart, start))) continue;
    const valueStart = match.index + match[0].length;
    const lineEnd = source.indexOf("\n", valueStart);
    const value = source.slice(valueStart, lineEnd === -1 ? undefined : lineEnd);
    found.push({ line: lineOf(source, start), name: match[2], value });
  }
  return found;
}

/** Pourquoi la valeur d'un champ ment sur son étape, ou `null`. */
export function dishonesty({ name, value }) {
  if (CONFIGURED.test(value)) {
    return "se lit dans le réglage du mailer — un mailer configuré n'a rien envoyé";
  }
  const accepted = name === "mailAccepted" || OLD_NAMES.includes(name);
  if (
    (accepted || name === "mailDelivered") &&
    DEFERRED_SEND.test(value) &&
    !IMMEDIATE_SEND.test(value)
  ) {
    return "se lit dans mail.send — la demande est enregistrée (MailRequested), rien n'est accepté";
  }
  if (name === "mailDelivered" && IMMEDIATE_SEND.test(value)) {
    return "se lit dans sendAndAwaitReceipt — Resend a accepté (MailAcceptance), rien n'est remis";
  }
  return null;
}

/** Dans la portée : ce que l'API sert. */
export function inScope(path) {
  if (path.includes("/__tests__/") || path.endsWith(".spec.ts")) return false;
  if (path.startsWith(`${CONTRACTS}/`)) return true;
  if (!path.startsWith(`${API}/`) || path.startsWith(`${API}/platform/database/client/`))
    return false;
  return !/\/(?:domain|infrastructure)\//.test(path);
}

/** Le verdict, pur : ce qui échoue, et la dette restante. */
export function verdict(files, debt) {
  const failures = [];
  const counts = new Map();
  for (const { path, source } of files) {
    if (!inScope(path)) continue;
    for (const field of stageFields(source)) {
      const lie = dishonesty(field);
      if (lie !== null) failures.push(`${path}:${field.line}  « ${field.name} » ${lie}`);
      if (OLD_NAMES.includes(field.name)) counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  for (const [path, count] of counts) {
    const allowed = debt[path]?.count ?? 0;
    if (count > allowed) {
      failures.push(
        `${path}  ${count} champ(s) à l'ancien nom (${OLD_NAMES.join(", ")}) pour ${allowed} admis — ` +
          "nomme l'étape : mailRequested (mail.send), mailAccepted (sendAndAwaitReceipt), mailDelivered (le suivi)",
      );
    } else if (count < allowed) {
      failures.push(
        `${path}  ${count} champ(s) à l'ancien nom, ${allowed} inscrits — abaisse le compte dans DEBT (${SELF})`,
      );
    }
  }
  for (const path of Object.keys(debt)) {
    if (!counts.has(path)) {
      failures.push(
        `${path}  inscrit dans DEBT mais n'a plus d'ancien nom (ou a disparu) — retire-le de DEBT`,
      );
    }
  }
  const remaining = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return { failures, remaining, files: counts.size };
}

function typescriptFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...typescriptFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) out.push(full);
  }
  return out;
}

function main() {
  const root = process.cwd();
  const files = [API, CONTRACTS]
    .flatMap((dir) => typescriptFiles(join(root, dir)))
    .map((full) => ({
      path: relative(root, full).replace(/\\/g, "/"),
      source: readFileSync(full, "utf8"),
    }));
  const { failures, remaining, files: indebted } = verdict(files, DEBT);
  if (failures.length > 0) {
    console.error("\n✗ mail-status-honest\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). Un champ qui dit qu'un e-mail est parti nomme son étape ` +
        "(le-suivi-des-e-mails.md, T4).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ mail-status-honest : aucun champ d'e-mail tiré du réglage ni d'une simple demande ; ` +
      `dette : ${remaining} champ(s) à l'ancien nom dans ${indebted} fichier(s), qui ne peut que décroître.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

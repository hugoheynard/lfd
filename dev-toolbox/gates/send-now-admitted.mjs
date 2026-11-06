#!/usr/bin/env node
/**
 * Gate : **`sendNow` ne s'appelle que depuis une liste admise** (plan
 * `documentation/editeur-de-contenu/plan-service-e-mails.md`, C2 ; décidé par
 * Hugo le 2026-11-06).
 *
 * La porte `MailRequests` offre deux gestes. `request` est le défaut : la
 * demande s'écrit dans la transaction de l'appelant, part après validation par
 * l'outbox, et se relance seule. `sendNow` envoie tout de suite, sans outbox :
 * un échec n'est pas relancé, il est rendu à l'appelant. Il ne se justifie que
 * pour un geste qui doit lire le résultat (un staff à l'écran, un reçu écrit
 * dans un fait). Chaque appelant est donc inscrit ici avec sa raison et sa
 * date.
 *
 * ## Ce que la porte refuse
 *
 * - un appel `sendNow(` dans un fichier hors du bloc `mail` et hors de
 *   ADMITTED : passer par `request`, ou s'inscrire avec sa raison ;
 * - une entrée de ADMITTED qui n'appelle plus `sendNow` (ou a disparu) : la
 *   liste n'a pas d'entrée morte.
 *
 * Le bloc `mail` lui-même est hors portée : il implémente `sendNow`, et sa
 * sonde de déploiement comme l'essai d'un e-mail y vivent.
 *
 * Portée : `apps/lfd-api/src/**.ts`, hors `__tests__/` et `*.spec.ts`. Les
 * commentaires sont blanchis : ils citent `sendNow` pour l'expliquer.
 *
 * Usage : `pnpm lint:send-now-admitted`. Tests :
 * `node --test dev-toolbox/__tests__/send-now-admitted.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { withoutComments } from "./mail-through-block.mjs";

export { withoutComments };

const SRC = "apps/lfd-api/src";
const MAIL_BLOCK = `${SRC}/mail/`;

/** Les appelants admis de `sendNow`, chacun avec sa raison (relevés le 2026-11-06). */
export const ADMITTED = {
  [`${SRC}/b2b/orders/application/commands/resend-order-payment-link.handler.ts`]:
    "2026-11-06, S2a — le staff renvoie le lien de paiement et lit à l'écran s'il est parti",
  [`${SRC}/b2b/account/application/services/grant-account-access.service.ts`]:
    "2026-11-06, S2b — ouverture d'accès client : le staff lit `mailSent` à l'écran",
  [`${SRC}/b2b/account/infrastructure/auth0-customer-identity.ts`]:
    "2026-11-06, S2b — réinitialisation du mot de passe : le lien ne doit pas dormir 30 jours dans l'outbox",
  [`${SRC}/b2b/account/infrastructure/dev-customer-identity.ts`]:
    "2026-11-06, S2b — double de dev de la réinitialisation : même geste que l'adaptateur Auth0",
  [`${SRC}/b2b/accounting/application/services/collection-notice-sender.ts`]:
    "2026-11-06, S2d — avis de prélèvement : l'issue écrite par l'appelant lit le reçu",
  [`${SRC}/b2b/accounting/application/services/invoice-notice-sender.ts`]:
    "2026-11-06, S2d — renvoi de facture par le staff : il attend la réponse",
  [`${SRC}/b2b/payments/application/commands/send-mandate.handler.ts`]:
    "2026-11-06, S2e — mandat : le fait publié lit le reçu, PDF en octets",
  [`${SRC}/production/application/services/dossier-dispatch.service.ts`]:
    "2026-11-06, S2f — dossier du fournil : le fait lit le reçu, PDF en octets",
  [`${SRC}/staff/invitations/open-staff-access.service.ts`]:
    "2026-11-06, S2g — ouverture d'accès d'équipe : le staff lit le résultat à l'écran",
  [`${SRC}/b2b/vitrine/application/services/vitrine-notice-dispatcher.ts`]:
    "2026-11-06, S2h — vitrine : chaque avis lit son reçu pour écrire son issue",
};

const CALL = /\bsendNow\s*(?:<[^>]*>)?\s*\(/g;
const lineOf = (source, index) => source.slice(0, index).split("\n").length;

const TEMPLATE = /^[^;]*?\btemplate\s*:\s*["'`]([^"'`]+)["'`]/;

/** Les appels `sendNow(` d'une source, commentaires blanchis : ligne et modèle s'il se lit. */
export function sendNowCalls(raw) {
  const source = withoutComments(raw);
  return [...source.matchAll(CALL)].map((match) => {
    const after = source.slice(match.index + match[0].length, match.index + match[0].length + 600);
    return { line: lineOf(source, match.index), template: TEMPLATE.exec(after)?.[1] ?? null };
  });
}

/** Les lignes des appels `sendNow(` d'une source. */
export function callsIn(raw) {
  return sendNowCalls(raw).map((call) => call.line);
}

/** Le message d'un appel refusé : où, quoi, pourquoi, et les deux sorties. */
export function refusal(path, { line, template }) {
  const model = template === null ? "modèle non lisible" : `modèle « ${template} »`;
  return [
    `${path}:${line}  sendNow hors liste (${model})`,
    "      pourquoi : sendNow envoie sans outbox : un redémarrage ou une panne de Resend perd l'e-mail, sans relance",
    "      sortie 1 : passe par request dans une unité de travail",
    "      sortie 2 : ajoute ce fichier à ADMITTED (dev-toolbox/gates/send-now-admitted.mjs) avec sa raison et la date, " +
      "si un écran lit le reçu ou si un état métier dépend de l'acceptation par Resend",
  ].join("\n");
}

/** Le verdict, pur : ce qui échoue, et le nombre d'appels admis. */
export function verdict(files, admitted) {
  const failures = [];
  const callers = new Set();
  let admittedCalls = 0;
  for (const { path, source } of files) {
    if (path.startsWith(MAIL_BLOCK)) continue;
    const calls = sendNowCalls(source);
    if (calls.length === 0) continue;
    callers.add(path);
    if (path in admitted) {
      admittedCalls += calls.length;
      continue;
    }
    for (const call of calls) failures.push(refusal(path, call));
  }
  for (const path of Object.keys(admitted)) {
    if (!callers.has(path)) {
      failures.push(
        `${path}  admis mais n'appelle plus sendNow (ou disparu) — retire-la de ADMITTED`,
      );
    }
  }
  return { failures, admitted: [...callers].filter((path) => path in admitted), admittedCalls };
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
  const { failures, admitted, admittedCalls } = verdict(files, ADMITTED);
  if (failures.length > 0) {
    console.error("\n✗ send-now-admitted\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). \`request\` est le geste par défaut ; ` +
        "`sendNow` se justifie (plan-service-e-mails.md, C2).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ send-now-admitted : ${files.length} fichier(s) lus, ${admittedCalls} appel(s) admis de sendNow dans ${admitted.length} fichier(s), aucun hors liste.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

#!/usr/bin/env node
/**
 * Gate : **`mail.sendAndAwaitReceipt` ne s'appelle que depuis une liste
 * admise, et la porte `Mail` s'injecte sous le nom `mail`** (plan
 * `documentation/mail/plan-service-e-mails.md`, C2 et § 21 ;
 * décidé par Hugo le 2026-11-06). Elle s'est appelée `send-now-admitted`
 * jusqu'au renommage de la porte (§ 21), le même jour.
 *
 * La porte `Mail` offre deux gestes. `mail.send` est le défaut : la demande
 * s'écrit dans la transaction de l'appelant, part après validation par
 * l'outbox, et se relance seule. `mail.sendAndAwaitReceipt` envoie tout de
 * suite, sans outbox : un échec n'est pas relancé, il est rendu à l'appelant.
 * Il ne se justifie que pour un geste qui doit lire le résultat (un staff à
 * l'écran, un reçu écrit dans un fait). Chaque appelant est donc inscrit ici
 * avec sa raison et sa date.
 *
 * ## Ce que la porte refuse
 *
 * - un appel `sendAndAwaitReceipt(` dans un fichier hors du bloc `mail` et
 *   hors de ADMITTED : passer par `mail.send`, ou s'inscrire avec sa raison ;
 * - une entrée de ADMITTED qui n'appelle plus `sendAndAwaitReceipt` (ou a
 *   disparu) : la liste n'a pas d'entrée morte ;
 * - une injection de `Mail` sous un autre nom que `mail`
 *   (`private readonly mails: Mail`) : lu hors contexte, `this.mail.send(…)`
 *   dit ce qu'il fait ; `this.requests.send(…)` ne le dit pas.
 *
 * Le bloc `mail` lui-même est hors portée des appels : il implémente
 * `sendAndAwaitReceipt`, et sa sonde de déploiement comme l'essai d'un e-mail
 * y vivent. Il reste dans la portée du nom.
 *
 * Portée : `apps/lfd-api/src/**.ts`, hors `__tests__/` et `*.spec.ts`. Les
 * commentaires sont blanchis : ils citent les gestes pour les expliquer.
 *
 * Usage : `pnpm gate mail-receipt-admitted`. Tests :
 * `node --test dev-toolbox/__tests__/mail-receipt-admitted.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { withoutComments } from "./mail-through-block.mjs";

export { withoutComments };

const SRC = "apps/lfd-api/src";
const MAIL_BLOCK = `${SRC}/mail/`;
const SELF = "dev-toolbox/gates/mail-receipt-admitted.mjs";

/** Les appelants admis de `sendAndAwaitReceipt`, chacun avec sa raison (relevés le 2026-11-06). */
export const ADMITTED = {
  [`${SRC}/lafoliecoffee/orders/application/commands/resend-order-payment-link.handler.ts`]:
    "2026-11-06, S2a — le staff renvoie le lien de paiement et lit à l'écran s'il est parti",
  [`${SRC}/lafoliecoffee/account/application/services/grant-account-access.service.ts`]:
    "2026-11-06, S2b — ouverture d'accès client : le staff lit `mailSent` à l'écran",
  [`${SRC}/lafoliecoffee/account/infrastructure/auth0-customer-identity.ts`]:
    "2026-11-06, S2b — réinitialisation du mot de passe : le lien ne doit pas dormir 30 jours dans l'outbox",
  [`${SRC}/lafoliecoffee/account/infrastructure/dev-customer-identity.ts`]:
    "2026-11-06, S2b — double de dev de la réinitialisation : même geste que l'adaptateur Auth0",
  [`${SRC}/lafoliecoffee/accounting/application/services/collection-notice-sender.ts`]:
    "2026-11-06, S2d — avis de prélèvement : l'issue écrite par l'appelant lit le reçu",
  [`${SRC}/lafoliecoffee/accounting/application/services/invoice-notice-sender.ts`]:
    "2026-11-06, S2d — renvoi de facture par le staff : il attend la réponse",
  [`${SRC}/lafoliecoffee/payments/application/commands/send-mandate.handler.ts`]:
    "2026-11-06, S2e — mandat : le fait publié lit le reçu, PDF en octets",
  [`${SRC}/production/application/services/dossier-dispatch.service.ts`]:
    "2026-11-06, S2f — dossier du fournil : le fait lit le reçu, PDF en octets",
  [`${SRC}/staff/invitations/open-staff-access.service.ts`]:
    "2026-11-06, S2g — ouverture d'accès d'équipe : le staff lit le résultat à l'écran",
  [`${SRC}/lafoliecoffee/vitrine/application/services/vitrine-notice-dispatcher.ts`]:
    "2026-11-06, S2h — vitrine : chaque avis lit son reçu pour écrire son issue",
};

const CALL = /\bsendAndAwaitReceipt\s*(?:<[^>]*>)?\s*\(/g;
const INJECTION =
  /\b(?:private|protected|public|readonly)\s+(?:readonly\s+)?(\w+)\s*:\s*Mail\b(?![\w.])/g;
const lineOf = (source, index) => source.slice(0, index).split("\n").length;

const TEMPLATE = /^[^;]*?\btemplate\s*:\s*["'`]([^"'`]+)["'`]/;

/** Les appels `sendAndAwaitReceipt(` d'une source, commentaires blanchis : ligne et modèle s'il se lit. */
export function receiptCalls(raw) {
  const source = withoutComments(raw);
  return [...source.matchAll(CALL)].map((match) => {
    const after = source.slice(match.index + match[0].length, match.index + match[0].length + 600);
    return { line: lineOf(source, match.index), template: TEMPLATE.exec(after)?.[1] ?? null };
  });
}

/** Les lignes des appels `sendAndAwaitReceipt(` d'une source. */
export function callsIn(raw) {
  return receiptCalls(raw).map((call) => call.line);
}

/** Les injections de `Mail` sous un autre nom que `mail` : ligne et nom. */
export function misnamedInjections(raw) {
  const source = withoutComments(raw);
  return [...source.matchAll(INJECTION)]
    .filter((match) => match[1] !== "mail")
    .map((match) => ({ line: lineOf(source, match.index), name: match[1] }));
}

/** Le message d'un appel refusé : où, quoi, pourquoi, et les deux sorties. */
export function refusal(path, { line, template }) {
  const model = template === null ? "modèle non lisible" : `modèle « ${template} »`;
  return [
    `${path}:${line}  mail.sendAndAwaitReceipt hors liste (${model})`,
    "      pourquoi : sendAndAwaitReceipt envoie sans outbox : un redémarrage ou une panne de Resend perd l'e-mail, sans relance",
    "      sortie 1 : passe par mail.send dans une unité de travail",
    `      sortie 2 : ajoute ce fichier à ADMITTED (${SELF}) avec sa raison et la date, ` +
      "si un écran lit le reçu ou si un état métier dépend de l'acceptation par Resend",
  ].join("\n");
}

/** Le message d'une injection mal nommée. */
export function misnamed(path, { line, name }) {
  return (
    `${path}:${line}  la porte Mail est injectée sous le nom « ${name} » — ` +
    "renomme-la `mail` (`private readonly mail: Mail`) : `this.mail.send(…)` se lit sans contexte"
  );
}

/** Le verdict, pur : ce qui échoue, et le nombre d'appels admis. */
export function verdict(files, admitted) {
  const failures = [];
  const callers = new Set();
  let admittedCalls = 0;
  for (const { path, source } of files) {
    for (const injection of misnamedInjections(source)) failures.push(misnamed(path, injection));
    if (path.startsWith(MAIL_BLOCK)) continue;
    const calls = receiptCalls(source);
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
        `${path}  admis mais n'appelle plus mail.sendAndAwaitReceipt (ou disparu) — retire-la de ADMITTED`,
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
    console.error("\n✗ mail-receipt-admitted\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). \`mail.send\` est le geste par défaut ; ` +
        "`mail.sendAndAwaitReceipt` se justifie (plan-service-e-mails.md, C2 et § 21).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ mail-receipt-admitted : ${files.length} fichier(s) lus, ${admittedCalls} appel(s) admis de ` +
      `mail.sendAndAwaitReceipt dans ${admitted.length} fichier(s), aucun hors liste, porte injectée sous « mail » partout.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

#!/usr/bin/env node
/**
 * Gate : **tout adaptateur qui appelle le réseau pose la garde
 * `assertOutsideTransaction`** (chantier
 * `documentation/todos/todo-reseau-hors-transaction.md` ; Hugo, 2026-11-06 :
 * « commence par faire la porte, l'activer et voir combien d'erreurs on a »).
 *
 * La règle du chantier : aucun appel réseau sortant dans une transaction de
 * base. Un appel se fait avant, ou après la validation par l'outbox. La
 * garde (`apps/lfd-api/src/platform/database/outside-transaction.ts`) le
 * constate à l'exécution — journalisé en `report`, refusé en `enforce`. La
 * porte, elle, tient qu'aucun appel sortant n'échappe à la garde : un
 * adaptateur sans garde est un appel que la mesure ne verra jamais.
 *
 * ## Ce qu'est un appel sortant (commentaires blanchis)
 *
 * `fetch(`, un client Stripe (`new Stripe(`, `import Stripe from "stripe"`),
 * un client de stockage (`new S3StorageService(`, `new S3Client(`,
 * `@aws-sdk/*`), le transport Resend (`createMailer(`,
 * `createResendInboundReader(`, `ResendInboundReader`), `node:https` /
 * `node:http` / `node:dns` (hors `import type`), `web-push`, les clés
 * distantes de `jose` (`createRemoteJWKSet(`). Le client Auth0 est un
 * `fetch(` (`auth0-management.client.ts`), le planificateur de tournées et
 * le géocodage aussi.
 *
 * **Et tout import non typé d'un paquet classé `network`** dans
 * `lint/dependency-network-class.json` (2026-11-06, Hugo) : les motifs ne
 * reconnaissent que les clients connus, et une bibliothèque réseau ajoutée
 * demain n'en emprunterait aucun. Chaque paquet externe importé par l'API —
 * `node:*` et `@lfd/*` compris — y est classé `network` ou `local`, avec sa
 * raison (`network-dependency-class.mjs`). Les motifs restent : `fetch` est
 * global, sans import.
 *
 * ## Ce que la porte refuse
 *
 * - un fichier qui fait un appel sortant sans appeler
 *   `assertOutsideTransaction(`, ni figurer dans ADMITTED ou DELEGATED ;
 * - une entrée DELEGATED dont le fichier gardien n'appelle pas la garde ;
 * - une entrée de ADMITTED ou DELEGATED qui ne fait plus d'appel sortant (ou
 *   a disparu) : la liste n'a pas d'entrée morte.
 *
 * - un import d'un paquet non classé (« nouvelle dépendance ») ;
 * - une entrée du classement que plus rien n'importe, ou sans raison.
 *
 * Portée : `apps/lfd-api/src/**.ts`, hors `__tests__/` et `*.spec.ts`.
 *
 * Usage : `pnpm gate network-outside-transaction`. Tests :
 * `node --test dev-toolbox/__tests__/network-outside-transaction.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { withoutComments } from "./mail-through-block.mjs";
import {
  CLASS_FILE,
  classificationFailures,
  firstNetworkImport,
} from "./network-dependency-class.mjs";

const SRC = "apps/lfd-api/src";
const SELF = "dev-toolbox/gates/network-outside-transaction.mjs";
const GUARD = /\bassertOutsideTransaction\s*\(/;

/** Les motifs d'un appel sortant : ce qu'on cherche, et comment le nommer. */
export const OUTBOUND = [
  { name: "fetch", pattern: /(?<![\w.$])fetch\s*\(/g },
  {
    name: "client Stripe",
    pattern: /\bnew\s+Stripe\s*\(|^import\s+Stripe\s+from\s+["']stripe["']/gm,
  },
  { name: "client de stockage", pattern: /\bnew\s+(?:S3StorageService|S3Client)\s*\(/g },
  { name: "SDK AWS", pattern: /^import\s+(?!type\b)[^;]*from\s+["']@aws-sdk\//gm },
  {
    name: "transport Resend",
    pattern:
      /\b(?:createMailer|createResendMailer|createResendInboundReader)\s*(?:<[^>]*>)?\s*\(|\bResendInboundReader\b/g,
  },
  {
    name: "node:https/http/dns",
    pattern: /^import\s+(?!type\b)[^;]*from\s+["']node:(?:https|http|dns|dns\/promises)["']/gm,
  },
  { name: "web-push", pattern: /^import\s+(?!type\b)[^;]*from\s+["']web-push["']/gm },
  { name: "clés distantes jose", pattern: /\bcreateRemoteJWKSet\s*\(/g },
];

/**
 * Les fichiers qui font un appel sortant SANS garde, chacun avec sa raison
 * (relevés le 2026-11-06). Une entrée ici est une affirmation : « ce fichier
 * ne peut pas s'exécuter dans une transaction ».
 */
export const ADMITTED = {
  [`${SRC}/platform/auth/remote-key-set.ts`]:
    "2026-11-06 — les clés de signature Auth0 se lisent à la vérification du jeton, à l'entrée de la requête, avant tout handler ; jose les garde 24 h",
  [`${SRC}/b2b/payments/infrastructure/stripe-intent-translation.ts`]:
    "2026-11-06 — n'importe Stripe que pour ses classes d'erreur : aucun appel",
  [`${SRC}/card-payment/infrastructure/stripe/stripe-intent-translation.ts`]:
    "2026-11-09 — copie du précédent (plan M2, P0) : n'importe Stripe que pour ses classes d'erreur, aucun appel",
  [`${SRC}/dev/seeding/storage.seed.ts`]:
    "2026-11-06 — semis local du bucket de développement, hors de toute requête",
};

/**
 * Les fichiers qui CONSTRUISENT ou portent un client sortant dont un autre
 * fichier fait les appels — et pose la garde (relevés le 2026-11-06).
 */
export const DELEGATED = {
  [`${SRC}/mail/templates/mail-transport.providers.ts`]: {
    guard: `${SRC}/mail/templates/effective-copy/effective-copy-mailer.ts`,
    reason:
      "2026-11-08 — le transport Resend n'envoie que sous EffectiveCopyMailer, qui l'enveloppe (JournalingMailer retiré en T1b)",
  },
  [`${SRC}/platform/mailer/mailer.module.ts`]: {
    guard: `${SRC}/platform/mailer/inbound/resend-inbound-mail.reader.ts`,
    reason: "2026-11-06 — le lecteur Resend construit ici ne lit que par ResendInboundMailReader",
  },
  [`${SRC}/platform/outbound/host-resolver.ts`]: {
    guard: `${SRC}/platform/outbound/pinned-https-webhook-poster.ts`,
    reason:
      "2026-11-06 — la résolution DNS n'est demandée que par le relais des webhooks, qui garde post()",
  },
  [`${SRC}/b2b/payments/infrastructure/stripe-refund-calls.ts`]: {
    guard: `${SRC}/b2b/payments/infrastructure/stripe-payment-refunder.ts`,
    reason: "2026-11-06 — n'est appelé que par StripePaymentRefunder, qui garde chaque méthode",
  },
};

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Le premier appel sortant d'une source, commentaires blanchis : ligne et nature, ou `null`. */
export function firstOutbound(raw, classes = {}) {
  const source = withoutComments(raw);
  let first = firstNetworkImport(raw, classes);
  for (const { name, pattern } of OUTBOUND) {
    pattern.lastIndex = 0;
    const match = pattern.exec(source);
    const line = match === null ? 0 : lineOf(source, match.index);
    if (match !== null && (first === null || line < first.line)) {
      first = { line, name };
    }
  }
  return first === null ? null : { line: first.line, name: first.name };
}

/** La source appelle-t-elle la garde (hors commentaire) ? */
export function guards(raw) {
  return GUARD.test(withoutComments(raw));
}

/** Le message d'un adaptateur sans garde : où, quoi, et les deux sorties. */
export function refusal(path, { line, name }) {
  return [
    `${path}:${line}  appel sortant (${name}) sans assertOutsideTransaction`,
    "      pourquoi : un appel réseau dans une transaction tient verrous et connexion le temps du tiers, et un ROLLBACK le renie",
    '      sortie 1 : appelle assertOutsideTransaction("<ce qui est appelé>") en tête de chaque méthode qui touche le réseau ' +
      "(platform/database/outside-transaction.ts), avant le test « non configuré »",
    `      sortie 2 : inscris ce fichier dans ADMITTED ou DELEGATED (${SELF}) avec sa raison et la date, ` +
      "s'il ne peut pas s'exécuter dans une transaction ou si un autre fichier garde ses appels",
  ].join("\n");
}

/** Le verdict, pur : ce qui échoue, et le relevé des adaptateurs. */
export function verdict(files, admitted, delegated, classes = null) {
  const failures = classes === null ? [] : classificationFailures(files, classes);
  const outbound = new Map();
  const bySource = new Map(files.map((file) => [file.path, file.source]));
  const guarded = [];
  for (const { path, source } of files) {
    const call = firstOutbound(source, classes ?? {});
    if (call === null) continue;
    outbound.set(path, call);
    if (path in admitted || path in delegated) continue;
    if (guards(source)) {
      guarded.push(path);
      continue;
    }
    failures.push(refusal(path, call));
  }
  for (const path of [...Object.keys(admitted), ...Object.keys(delegated)]) {
    if (!outbound.has(path)) {
      failures.push(
        `${path}  inscrit dans ${SELF} mais ne fait plus d'appel sortant (ou disparu) — retire l'entrée`,
      );
    }
  }
  for (const [path, { guard }] of Object.entries(delegated)) {
    const source = bySource.get(guard);
    if (source === undefined || !guards(source)) {
      failures.push(
        `${path}  délégué à ${guard}, qui n'appelle pas assertOutsideTransaction (ou a disparu) — pose la garde là, ou ici`,
      );
    }
  }
  return { failures, guarded, outbound: outbound.size };
}

/** Le client Prisma généré (ignoré par git, 500 Ko) : ni un adaptateur, ni une dépendance à classer. */
const GENERATED = join(SRC, "platform/database/client");

function typescriptFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (full.endsWith(GENERATED)) continue;
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
  const classes = JSON.parse(readFileSync(join(root, CLASS_FILE), "utf8")).packages;
  const { failures, guarded, outbound } = verdict(files, ADMITTED, DELEGATED, classes);
  if (failures.length > 0) {
    console.error("\n✗ network-outside-transaction\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). Aucun appel réseau dans une transaction : ` +
        "documentation/todos/todo-reseau-hors-transaction.md.\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ network-outside-transaction : ${files.length} fichier(s) lus, ${outbound} font un appel sortant — ` +
      `${guarded.length} gardés, ${Object.keys(DELEGATED).length} délégués, ${Object.keys(ADMITTED).length} admis ; ${Object.keys(classes).length} paquet(s) classés.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

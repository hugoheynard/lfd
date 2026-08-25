#!/usr/bin/env node
/**
 * Gate : un handler qui écrit un acte dont on devra répondre, le journalise.
 *
 * ## Pourquoi une porte, et pas la revue
 *
 * La traçabilité du PIM repose sur une discipline : le handler appelle
 * `PimJournal` dans une `UnitOfWork`. Rien ne l'y oblige. Un handler neuf qui
 * l'oublie écrit sans trace — et ce manquement ne se voit NULLE PART : `tsc`
 * est content, les tests passent, l'écran fonctionne. Il ne se découvre que le
 * jour où quelqu'un demande « qui a changé ça », et où la réponse est un blanc
 * qu'on ne peut plus combler rétroactivement.
 *
 * C'est le pire profil pour une garantie : invisible tant qu'on ne s'en sert
 * pas, inutilisable le jour où l'on s'en sert.
 *
 * ## Ce que la porte vérifie exactement — deux zones, deux disciplines
 *
 * **Le référentiel** (`src/pim/**`) : tout `@CommandHandler` qui injecte un port
 * de dépôt (`*Repository`) doit AUSSI injecter `PimJournal` et `UnitOfWork`.
 * C'est un filet, pas une preuve : injecter le journal n'oblige pas à l'appeler
 * — mais le laissez-passer (`WriteTicket`), lui, l'oblige, et il est tenu par le
 * compilateur.
 *
 * **Les actes du staff sur un compte client** (`src/b2b/account/**`) : tout
 * handler dont le nom dit qu'un agent agit sur le dossier de quelqu'un d'autre
 * doit APPELER `publishTraced` — pas seulement injecter quelque chose. La
 * discipline y est différente parce que le besoin l'est : les faits des comptes
 * sont des actes nommés que l'événement porte déjà, là où ceux du référentiel
 * portent des diffs que seul le handler sait calculer. Le handler garde donc sa
 * ligne d'origine, et c'est l'événement qui dit ce qu'il inscrit.
 *
 * Et parce qu'une trace hors transaction n'engage à rien, ces handlers doivent
 * aussi injecter `UnitOfWork` — sauf à déclarer `@hors-transaction <raison>`,
 * qui se grep comme le reste. Un seul le fait aujourd'hui, et pour une raison
 * qui tient : il range d'abord un fichier au stockage objet, et enfermer cet
 * aller-retour réseau dans une transaction de base serait pire que le trou qu'on
 * refermerait.
 *
 * ## L'échappatoire, et pourquoi elle est visible
 *
 * Un handler qui n'a légitimement rien à tracer déclare `@sans-journal <raison>`
 * dans son commentaire. Elle se grep, elle porte un motif, et elle se relit.
 * Une exception silencieuse serait indiscernable d'un oubli — c'est exactement
 * ce que cette porte existe pour empêcher.
 *
 * Usage : `pnpm lint:journal-tracked` (branché en CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps", "lfd-api", "src");
const SKIP_DIRS = new Set(["__tests__", "node_modules", "dist", "client"]);

/**
 * Un handler dont le NOM dit qu'un agent agit sur le compte d'un tiers.
 *
 * Par le nom, faute de mieux : rien dans le type ne distingue « le client
 * modifie son adresse » de « un agent modifie l'adresse du client », et c'est
 * pourtant toute la différence — le premier n'engage que lui. La convention
 * `…ByStaff` porte déjà cette distinction dans les commandes ; les cinq gestes
 * qui n'ont pas de jumeau client (certifier, activer, changer le statut,
 * accorder un délai) sont nommés en clair.
 */
const STAFF_ACT =
  /(ByStaffHandler|GrantTermsHandler|CertifyKbisHandler|RevokeKbisCertificationHandler|ChangeCompanyStatusHandler)$/;

/**
 * Les **réglages commerciaux** : ce qu'un client paie pour être livré, ce que
 * lui remise un retrait, à quelle heure sa commande bascule au lendemain.
 *
 * Tous leurs handlers sont concernés, sans exception de nom : ces modules
 * n'ont pas de chemin client — un client ne pose pas une zone de livraison. Là
 * où `b2b/account` mêle les deux et doit trier, ici tout est staff.
 */
const SETTINGS_ZONES = ["delivery-zones", "pickup-addresses", "order-cutoffs"];

/**
 * La tarification, elle, est tenue par le COMPILATEUR : ses dépôts d'écriture
 * exigent un `PricingAct` en paramètre, et un acte non fourni ne compile pas.
 * C'est plus fort que cette porte, et ça couvre règles, limites et barèmes.
 *
 * Restaient les engagements de volume — le seul objet tarifaire sans acte, donc
 * le seul que le compilateur ne garde pas. C'est celui-ci que la porte tient.
 */
const PRICING_ACT = /VolumeCommitmentHandler$/;

/**
 * La dette déclarée — **vide depuis le 2026-08-25**.
 *
 * Elle a compté quatorze handlers : ceux qui écrivaient déjà sans tracer le
 * jour où cette porte a été posée. Chacun demandait une décision propre — quel
 * fait nommer, quelle charge utile — et les traiter à la chaîne aurait produit
 * quatorze événements que personne n'aurait pensés. Ils ont été nommés un par
 * un ; la liste a fait ce pour quoi elle existait, elle a RÉTRÉCI jusqu'à
 * disparaître.
 *
 * On la garde vide plutôt que de la supprimer : c'est le mécanisme qui rend
 * une dette future visible et bornée, et le supprimer obligerait à le
 * réinventer sous pression, le jour où l'on voudra livrer un handler avant de
 * savoir ce qu'il affirme.
 */
const BACKLOG = new Set([]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (entry.endsWith(".ts")) {
      yield path;
    }
  }
}

/** Le corps du constructeur d'une classe — ses dépendances injectées. */
function constructorParams(source, from) {
  const start = source.indexOf("constructor(", from);
  if (start === -1) {
    return null;
  }
  let depth = 0;
  for (let i = source.indexOf("(", start); i < source.length; i += 1) {
    if (source[i] === "(") {
      depth += 1;
    } else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i);
      }
    }
  }
  return null;
}

const offenders = [];
const settled = [];
let checked = 0;
let excused = 0;
let owed = 0;

/** Le corps d'un handler : de son décorateur au décorateur suivant. */
function handlerBody(source, index) {
  const next = source.indexOf("@CommandHandler(", index + 1);
  return source.slice(index, next === -1 ? source.length : next);
}

/** Zone 1 — le référentiel : injecter le journal et l'unité de travail. */
function auditPim(source, index, params, handler) {
  if (!/\b\w*Repository\b/.test(params)) {
    return null;
  }
  checked += 1;
  const traced = params.includes("PimJournal") && params.includes("UnitOfWork");
  if (traced) {
    return { traced: true };
  }
  return {
    traced: false,
    missing: [
      params.includes("PimJournal") ? null : "PimJournal",
      params.includes("UnitOfWork") ? null : "UnitOfWork",
    ].filter(Boolean),
    handler,
  };
}

/** Zone 2 — les actes du staff : APPELER `publishTraced`, dans une transaction. */
function auditStaffAct(source, index, params, handler) {
  if (!STAFF_ACT.test(handler)) {
    return null;
  }
  return auditTraced(source, index, params, handler);
}

/** La vérification commune : le fait est inscrit, et il l'est dans une transaction. */
function auditTraced(source, index, params, handler) {
  checked += 1;
  // L'appel se cherche dans le CORPS du handler, et nulle part ailleurs : la
  // fenêtre large qu'on utilisait au début attrapait le `publishTraced` du
  // handler PRÉCÉDENT quand deux vivent dans le même fichier — la porte était
  // alors verte pour un handler muet, ce qu'elle existe précisément pour
  // empêcher. La dispense, elle, se déclare dans le commentaire qui précède le
  // décorateur, là où on la lit.
  const body = handlerBody(source, index);
  const head = source.slice(Math.max(0, index - 1200), index);
  const missing = [
    body.includes("publishTraced") ? null : "un appel à publishTraced",
    params.includes("UnitOfWork") || head.includes("@hors-transaction") ? null : "UnitOfWork",
  ].filter(Boolean);
  return missing.length === 0 ? { traced: true } : { traced: false, missing, handler };
}

const ZONES = [
  { root: join(SRC, "pim"), audit: auditPim },
  { root: join(SRC, "b2b", "account"), audit: auditStaffAct },
  ...SETTINGS_ZONES.map((zone) => ({
    root: join(SRC, "b2b", zone),
    audit: (source, index, params, handler) => auditTraced(source, index, params, handler),
  })),
  {
    root: join(SRC, "b2b", "pricing"),
    audit: (source, index, params, handler) =>
      PRICING_ACT.test(handler) ? auditTraced(source, index, params, handler) : null,
  },
];

for (const zone of ZONES) {
  for (const file of walk(zone.root)) {
    const source = readFileSync(file, "utf8");
    let index = source.indexOf("@CommandHandler(");
    while (index !== -1) {
      const params = constructorParams(source, index);
      const named = /export class (\w+)/.exec(source.slice(index)) ?? [];
      const handler = named[1] ?? "?";
      const verdict = params === null ? null : zone.audit(source, index, params, handler);
      if (verdict !== null) {
        const head = source.slice(Math.max(0, index - 1200), index);
        if (head.includes("@sans-journal")) {
          excused += 1;
        } else if (verdict.traced) {
          if (BACKLOG.has(handler)) {
            settled.push(handler);
          }
        } else if (BACKLOG.has(handler)) {
          owed += 1;
        } else {
          offenders.push({ file: relative(ROOT, file), handler, missing: verdict.missing });
        }
      }
      index = source.indexOf("@CommandHandler(", index + 1);
    }
  }
}

if (offenders.length > 0) {
  console.error("\n✖ Handlers qui écrivent SANS journaliser :\n");
  for (const offender of offenders) {
    console.error(`  ${offender.handler} — manque ${offender.missing.join(" + ")}`);
    console.error(`    ${offender.file}\n`);
  }
  console.error(
    "Un handler qui écrit sans trace ne se voit nulle part : tsc est content,\n" +
      "les tests passent, l'écran fonctionne. Ça se découvre le jour où l'on\n" +
      "demande « qui a changé ça » — et ce jour-là, le blanc ne se comble plus.\n\n" +
      "Soit il journalise — `PimJournal` + `UnitOfWork` au référentiel,\n" +
      "`publishTraced` sous unité de travail pour un acte du staff — soit il\n" +
      "déclare `@sans-journal <raison>` dans son commentaire : visible,\n" +
      "motivée, relisible.\n",
  );
  process.exit(1);
}

if (settled.length > 0) {
  console.error("\n✖ Handlers tracés mais toujours inscrits à la dette :\n");
  for (const handler of settled) {
    console.error(`  ${handler}`);
  }
  console.error(
    "\nRetire-les de `BACKLOG` dans dev-toolbox/gates/journal-tracked.mjs.\n" +
      "Une dette qui ne rétrécit pas cesse d'être une dette : elle devient un\n" +
      "décor, et le chiffre qu'elle affiche ne veut plus rien dire.\n",
  );
  process.exit(1);
}

console.log(
  `✓ journal-tracked : ${checked - owed - excused}/${checked} handler(s) écrivant sont tracés.` +
    (owed > 0 ? `\n  Dette : ${owed} restants — comptés, pas ignorés.` : "") +
    (excused > 0 ? `\n  Dispensés : ${excused}, motif déclaré.` : ""),
);

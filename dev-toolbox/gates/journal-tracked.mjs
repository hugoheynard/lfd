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
 * **Les comptes clients** (`src/b2b/account/**`) : tout handler — acte du
 * staff ou geste du client sur son propre compte, depuis le 2026-09-19 — doit
 * APPELER `publishTraced` — pas seulement injecter quelque chose. La
 * discipline y est différente parce que le besoin l'est : les faits des comptes
 * sont des actes nommés que l'événement porte déjà, là où ceux du référentiel
 * portent des diffs que seul le handler sait calculer. Le handler garde donc sa
 * ligne d'origine, et c'est l'événement qui dit ce qu'il inscrit.
 *
 * Et parce qu'une trace hors transaction n'engage à rien, ces handlers doivent
 * aussi injecter `UnitOfWork` — sauf à déclarer `@hors-transaction <raison>`,
 * qui se grep comme le reste. Ceux qui le font appellent un tiers d'abord — le
 * stockage objet, le fournisseur d'identité — et enfermer cet aller-retour
 * réseau dans une transaction de base serait pire que le trou qu'on
 * refermerait : le fait s'écrit après la réussite du tiers.
 *
 * ## L'échappatoire, et pourquoi elle est visible
 *
 * Un handler qui n'a légitimement rien à tracer déclare `@sans-journal <raison>`
 * dans son commentaire. Elle se grep, elle porte un motif, et elle se relit.
 * Une exception silencieuse serait indiscernable d'un oubli — c'est exactement
 * ce que cette porte existe pour empêcher.
 *
 * **L'équipe** (`src/staff/**`) : tout `@CommandHandler` doit APPELER
 * `journal.append` sous `UnitOfWork`, ou déléguer à `OpenStaffAccess` qui le
 * fait — cf. `STAFF_ZONE` plus bas.
 *
 * **L'argent** (`b2b/order-waivers/**`, `b2b/payments/**`, depuis le
 * 2026-09-19) : tout `@CommandHandler`, staff ou client, doit APPELER
 * `publishTraced` sous `UnitOfWork`, ou déléguer à une séquence partagée qui
 * le fait — cf. `MONEY_ZONES` plus bas.
 *
 * **Le catalogue B2B** (`b2b/catalog/**`, depuis le 2026-09-19) : tout
 * `@CommandHandler` doit APPELER `publishTraced` sous `UnitOfWork` — cf.
 * `CATALOG_ZONE` plus bas.
 *
 * **Les paniers récurrents** (`b2b/subscriptions/**`, depuis le 2026-09-19) :
 * même discipline — cf. `SUBSCRIPTIONS_ZONE` plus bas.
 *
 * **Le fournil** (`production/**`, depuis le 2026-09-19) : tout
 * `@CommandHandler` doit APPELER `publishTraced` sous `UnitOfWork` — cf.
 * `PRODUCTION_ZONE` plus bas.
 *
 * Usage : `pnpm lint:journal-tracked` (branché en CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps", "lfd-api", "src");
const SKIP_DIRS = new Set(["__tests__", "node_modules", "dist", "client"]);

/**
 * **Les comptes clients** : TOUS les handlers de `b2b/account`, depuis le
 * 2026-09-19 (lot 1 du plan du journal, tranche (c)).
 *
 * La zone a été bornée, jusque-là, aux handlers dont le NOM disait qu'un agent
 * agit sur le compte d'un tiers (`…ByStaff`, plus cinq gestes nommés en clair).
 * Ce filtre reposait sur une règle — « le client qui modifie son adresse
 * n'engage que lui » — que Hugo a levée ce jour-là (« tout doit être
 * journalisé », plan `documentation/journalisation/plan-journal-d-activite.md`
 * §3, décision 1) : un geste du client sur son propre compte journalise aussi,
 * **sans ses coordonnées**, sous le même nom que le geste staff jumeau.
 *
 * Sans tri par nom, un handler neuf de ce dossier — client ou staff — ne peut
 * plus y entrer sans journal : il journalise, ou il le déclare.
 */
const ACCOUNT_ZONE = "account";

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
 * **L'accès aux fonctionnalités** (2026-09-14) : fermer la boutique, la rouvrir,
 * exempter une adresse. Chaque geste décide qui peut commander, et la ligne qui
 * le porte est SUPPRIMÉE quand on revient en arrière — le journal est donc la
 * seule mémoire de « qui avait fermé, et depuis quand ».
 *
 * Tous ses handlers, sans tri par nom : le module n'a aucun chemin d'écriture
 * client. Zone à part plutôt qu'entrée de `SETTINGS_ZONES`, parce que ce n'est
 * pas un réglage commercial au sens de ce commentaire-là : il ne change aucun
 * prix, il ouvre ou ferme la vente.
 */
const FEATURE_ACCESS_ZONE = "feature-access";

/**
 * **Les notes du commercial** sur un compte client (2026-09-15, plan
 * `documentation/b2b/plan-notes-photo-du-commercial.md`, D6). Une note se
 * supprime DÉFINITIVEMENT, photo comprise : le journal est la seule mémoire de
 * « qui a retiré cette note, et quand » — sans jamais en garder le contenu.
 *
 * Tous ses handlers, sans tri par nom : le module n'a aucun chemin client.
 */
const CLIENT_NOTES_ZONE = "client-notes";

/**
 * **L'équipe** (`src/staff/**`, 2026-09-18, plan
 * `documentation/staff/journalisation-staff/architecture-journal-de-l-annuaire.md` D3) : qui
 * entre dans le back-office, avec quels droits, et qui l'a décidé. Tous ses
 * handlers d'écriture, sans tri par nom — un membre de l'équipe n'y agit que
 * sur l'accès des autres, ou sur un réglage à lui qu'il déclare
 * `@sans-journal`.
 *
 * La discipline est celle du référentiel, pas celle des comptes : les faits de
 * l'annuaire portent des DIFFS (« un fait par changement réel ») que seul le
 * handler sait calculer. Il APPELLE donc `journal.append` lui-même, dans une
 * `UnitOfWork`.
 *
 * Une délégation est admise, et une seule : `OpenStaffAccess`, que l'invitation
 * et la création partagent. Elle n'est pas un chèque en blanc — la porte vérifie
 * que le service délégué journalise lui-même, sous unité de travail.
 */
const STAFF_ZONE = "staff";
const STAFF_DELEGATES = new Map([
  ["OpenStaffAccess", join("staff", "invitations", "open-staff-access.service.ts")],
]);

/**
 * **L'argent** (lot 1 du plan du journal, tranche (a), 2026-09-19) : la
 * surtaxe de retard, les dérogations d'heure limite, le RIB et le mandat.
 * Tous leurs handlers, sans tri par nom — et dans `payments`, ceux du client
 * comme ceux du staff : le client qui change son RIB change le compte que nous
 * débitons, et depuis la décision du 2026-09-19 son geste journalise aussi.
 *
 * La discipline est celle des actes nommés (`publishTraced` sous
 * `UnitOfWork`), avec une nuance : `payments` partage ses séquences entre le
 * chemin client et le chemin staff, et le handler y DÉLÈGUE (cf.
 * `MONEY_DELEGATES`).
 */
const MONEY_ZONES = ["order-waivers", "payments"];

/**
 * Les séquences partagées de `payments` qui journalisent elles-mêmes, et le
 * fichier où la porte le VÉRIFIE — même geste que `STAFF_DELEGATES` : un nom
 * reconnu n'est pas un chèque en blanc. Le fichier doit appeler
 * `publishTraced(`, et ouvrir une unité de travail (`uow.run(`) ou appeler
 * l'une des `TRANSACTION_OPENERS`.
 *
 * ⚠️ `writeVoidingDraft` n'y est PAS, et c'est le cas qui a fait écrire cette
 * table : elle ne journalise que la révocation d'un brouillon, quand il y en a
 * un. Sans brouillon, un RIB changé par elle seule ne laissait aucune trace
 * (constaté le 2026-09-19). Elle ouvre la transaction ; elle ne vaut pas fait.
 */
const MONEY_DELEGATES = new Map([
  [
    "recordCompanyBankAccount",
    join("b2b", "payments", "application", "commands", "record-company-bank-account.ts"),
  ],
  [
    "recordMandateOptions",
    join("b2b", "payments", "application", "commands", "record-mandate-options.ts"),
  ],
  ["mintDraftMandate", join("b2b", "payments", "application", "mint-mandate-support.ts")],
  ["attachProofToDraft", join("b2b", "payments", "application", "mandate-proof-support.ts")],
]);

/**
 * **Le catalogue B2B** (lot 1 du plan du journal, tranche (b), 2026-09-19) :
 * prix négocié, visibilité, mise en avant, validation d'une arrivée. Tous ses
 * handlers, sans tri par nom — ce sont tous des gestes du staff sur ce qui est
 * vendu, et à quel prix. Aucune délégation : chacun appelle `publishTraced`
 * lui-même (vérifié le 2026-09-19, cinq handlers).
 */
const CATALOG_ZONE = "catalog";

/**
 * **Les paniers récurrents** (lot 1 du plan du journal, tranche (c),
 * 2026-09-19) : suspendre, reprendre, déroger à une échéance, supprimer. Tous
 * des gestes du client, qui décident de ce qu'on fabriquera et facturera sans
 * qu'une commande soit repassée.
 */
const SUBSCRIPTIONS_ZONE = "subscriptions";

/**
 * **Le fournil** (lot 1 du plan du journal, tranche (d), 2026-09-19) : arrêter,
 * reprendre une journée, régler le contenant d'un article. Un BLOC entier, pas
 * un dossier de `b2b/` — d'où sa racine à part. Tous ses handlers, sans tri par
 * nom. Les gestes d'atelier (coches, bacs) et le colisage déclarent
 * `@sans-journal` avec leur raison (vérifié le 2026-09-19, onze handlers).
 */
const PRODUCTION_ZONE = "production";

/** Ce qui ouvre l'unité de travail pour une délégation — sans journaliser pour elle. */
const TRANSACTION_OPENERS = new Map([
  ["writeVoidingDraft", join("b2b", "payments", "application", "draft-mandate-voiding.ts")],
]);

/*
 * Il n'y a plus de dette déclarée. La liste `BACKLOG` a compté quatorze
 * handlers à la pose de la porte, vidée le 2026-08-25 ; elle a resservi le
 * 2026-09-19 pour six gestes du client dont le nom de fait n'était pas tranché,
 * vidée le jour même. Gardée vide, elle n'était plus qu'un mécanisme sans
 * objet : retirée ce jour-là. Un handler qu'on voudrait livrer avant de savoir
 * ce qu'il affirme se déclare `@sans-journal <raison>`, qui se relit.
 */

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
let checked = 0;
let excused = 0;

/** Le corps d'un handler : de son décorateur au décorateur suivant. */
function handlerBody(source, index) {
  const next = source.indexOf("@CommandHandler(", index + 1);
  return source.slice(index, next === -1 ? source.length : next);
}

/** Zone 1 — le référentiel : injecter le journal et l'unité de travail. */
function auditPim(source, index, params, handler) {
  // `*Repository` — et `MediaLibraryWriter`, qui EST un dépôt sans en porter
  // le nom. La porte ne le voyait pas : c'est Hugo qui a réclamé le journal de
  // la médiathèque, pas elle (2026-09-23).
  if (!/\b(\w*Repository|MediaLibraryWriter|MediaLibrary)\b/.test(params)) {
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

/** Zone de l'équipe : APPELER `journal.append`, dans une transaction — ou déléguer à un service qui le fait. */
function auditStaff(source, index, params, handler) {
  checked += 1;
  const body = handlerBody(source, index);
  const delegate = [...STAFF_DELEGATES.keys()].find((name) => params.includes(name));
  if (delegate !== undefined) {
    const service = readFileSync(join(SRC, STAFF_DELEGATES.get(delegate)), "utf8");
    const traced = service.includes("journal.append(") && service.includes("UnitOfWork");
    return traced
      ? { traced: true }
      : { traced: false, missing: [`un ${delegate} qui journalise sous UnitOfWork`], handler };
  }
  const missing = [
    body.includes("journal.append(") ? null : "un appel à journal.append",
    params.includes("UnitOfWork") ? null : "UnitOfWork",
  ].filter(Boolean);
  return missing.length === 0 ? { traced: true } : { traced: false, missing, handler };
}

/** Une délégation de `MONEY_DELEGATES` journalise-t-elle vraiment, sous unité de travail ? */
function delegateJournals(name) {
  const service = readFileSync(join(SRC, MONEY_DELEGATES.get(name)), "utf8");
  const opensTransaction =
    service.includes("uow.run(") ||
    [...TRANSACTION_OPENERS].some(
      ([opener, file]) =>
        service.includes(`${opener}(`) &&
        readFileSync(join(SRC, file), "utf8").includes("uow.run("),
    );
  return service.includes("publishTraced(") && opensTransaction;
}

/**
 * Zone de l'argent : APPELER `publishTraced` sous unité de travail — ou
 * déléguer à une séquence de `MONEY_DELEGATES` qui le fait.
 */
function auditMoney(source, index, params, handler) {
  const body = handlerBody(source, index);
  const delegate = [...MONEY_DELEGATES.keys()].find((name) => body.includes(`${name}(`));
  if (delegate === undefined) {
    return auditTraced(source, index, params, handler);
  }
  checked += 1;
  const head = source.slice(Math.max(0, index - 1200), index);
  const missing = [
    delegateJournals(delegate) ? null : `un ${delegate} qui appelle publishTraced sous UnitOfWork`,
    params.includes("UnitOfWork") || head.includes("@hors-transaction") ? null : "UnitOfWork",
  ].filter(Boolean);
  return missing.length === 0 ? { traced: true } : { traced: false, missing, handler };
}

const ZONES = [
  { root: join(SRC, STAFF_ZONE), audit: auditStaff },
  { root: join(SRC, "pim"), audit: auditPim },
  // ▸ LA MÉDIATHÈQUE, sortie du référentiel le 2026-09-23. Sans cette ligne,
  //   ses écritures sortaient du périmètre en silence — et le journal qu'on
  //   venait de lui donner (Hugo : « le journal de la médiathèque, on le
  //   fait ») n'aurait plus rien garanti pour le geste suivant.
  { root: join(SRC, "media"), audit: auditPim },
  {
    root: join(SRC, "b2b", ACCOUNT_ZONE),
    audit: (source, index, params, handler) => auditTraced(source, index, params, handler),
  },
  ...SETTINGS_ZONES.map((zone) => ({
    root: join(SRC, "b2b", zone),
    audit: (source, index, params, handler) => auditTraced(source, index, params, handler),
  })),
  {
    root: join(SRC, "b2b", FEATURE_ACCESS_ZONE),
    audit: (source, index, params, handler) => auditTraced(source, index, params, handler),
  },
  {
    root: join(SRC, "b2b", CLIENT_NOTES_ZONE),
    audit: (source, index, params, handler) => auditTraced(source, index, params, handler),
  },
  ...MONEY_ZONES.map((zone) => ({ root: join(SRC, "b2b", zone), audit: auditMoney })),
  {
    root: join(SRC, "b2b", CATALOG_ZONE),
    audit: (source, index, params, handler) => auditTraced(source, index, params, handler),
  },
  {
    root: join(SRC, "b2b", SUBSCRIPTIONS_ZONE),
    audit: (source, index, params, handler) => auditTraced(source, index, params, handler),
  },
  {
    root: join(SRC, PRODUCTION_ZONE),
    audit: (source, index, params, handler) => auditTraced(source, index, params, handler),
  },
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
        } else if (!verdict.traced) {
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
      "`publishTraced` sous unité de travail pour un acte nommé (compte,\n" +
      "panier, catalogue, argent — ou une séquence de `MONEY_DELEGATES`),\n" +
      "`journal.append` sous unité de travail dans l'équipe — soit il\n" +
      "déclare `@sans-journal <raison>` dans son commentaire : visible,\n" +
      "motivée, relisible.\n",
  );
  process.exit(1);
}

console.log(
  `✓ journal-tracked : ${checked - excused}/${checked} handler(s) écrivant sont tracés.` +
    (excused > 0 ? `\n  Dispensés : ${excused}, motif déclaré.` : ""),
);

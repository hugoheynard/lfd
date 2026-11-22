#!/usr/bin/env node
/**
 * Gate : **une liste de sociétés dit ce qu'elle fait d'un compte supprimé.**
 *
 * « Supprimer le compte » est un soft delete : `archived_at` posé sur
 * `companies`, rien d'effacé (plan `plan-archiver-un-compte-jamais-servi.md`,
 * § 8). Le compte doit alors disparaître des vues du staff — liste, recherche,
 * suivi commercial, compteurs, sélecteurs — et des producteurs automatiques.
 * Une lecture qui ne le nomme pas le remontre, sans qu'aucun test ne rougisse :
 * c'est l'oubli que cette porte rend visible.
 *
 * ## La règle
 *
 * Tout appel `.company.findMany|count|groupBy|aggregate(` de `apps/lfd-api/src`
 * nomme `archivedAt` dans son argument (l'écarter, ou ne garder que lui), OU
 * le fichier figure dans `ADMITTED`, avec le NOMBRE exact de ses appels qui ne
 * le nomment pas et la raison. Un compte qui baisse sans que la liste suive
 * échoue aussi : une exception périmée se retire.
 *
 * Écarter un compte supprimé n'est pas écarter un compte résilié : la
 * résiliation le garde dans la liste (Hugo, 2026-11-22). `archivedAt` seul,
 * donc, et pas le prédicat de fermeture (`openCompanyWhere`), qui est celui
 * des MURS — d'où la règle sur le mot, pas sur la fonction.
 *
 * ## Ce que la porte NE voit pas
 *
 * `findUnique` / `findFirst` (une société désignée, pas une liste), le SQL
 * écrit à la main, les lectures par relation (`order.company`), et les
 * identifiants de société lus dans un autre modèle (journal, notes) : un
 * lecteur qui part d'un fait n'a rien à écarter — un compte supprimé n'a ni
 * commande, ni facture. Le tableau des choix est au § 9 du plan.
 *
 * Usage : `pnpm gate company-archived-views`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const SCAN = join("apps", "lfd-api", "src");
const SKIP_DIRS = new Set(["node_modules", "client", "__tests__"]);

/**
 * Les fichiers dont des appels ne nomment pas `archivedAt`, leur nombre, et
 * pourquoi (choix relevés le 2026-11-22).
 */
export const ADMITTED = new Map([
  // — Des noms par identifiants venus d'un fait : facture, commande, prélèvement…
  [
    "apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/prisma-detached-unpaid.reader.ts",
    { calls: 1, reason: "nomme les sociétés d'impayés : un compte supprimé n'a rien facturé" },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/prisma-monthly-invoicing.reader.ts",
    { calls: 1, reason: "nomme les payeurs d'une facturation : un supprimé n'a pas de commande" },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/prisma-collection-candidates.reader.ts",
    { calls: 1, reason: "nomme les candidats d'un prélèvement : un supprimé n'a rien à prélever" },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/prisma-statement-buyer.reader.ts",
    { calls: 1, reason: "l'acheteur d'un relevé, par identifiant : un supprimé n'en a pas" },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/prisma-billable-orders.reader.ts",
    { calls: 1, reason: "nomme les payeurs de commandes facturables : un supprimé n'en a pas" },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/prisma-statement-billing.reader.ts",
    {
      calls: 1,
      reason: "les sites d'un principal : un supprimé n'est ni site ni principal à sites",
    },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/prisma-payer-standings.reader.ts",
    {
      calls: 1,
      reason:
        "les payeurs et leur mode, que la facturation croise avec ses commandes : un supprimé n'en a pas",
    },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/prisma-own-establishments.ts",
    {
      calls: 1,
      reason: "nomme nos établissements déclarés, par identifiant : pas une liste de clients",
    },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/catalog/infrastructure/prisma-made-to-order-admin.reader.ts",
    { calls: 1, reason: "nomme les titulaires d'une réservation d'article, par identifiant" },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/loyalty/infrastructure/prisma-loyalty-ledger.reader.ts",
    {
      calls: 1,
      reason: "nomme les titulaires d'un grand livre de fidélité : un supprimé n'a rien gagné",
    },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/growth/infrastructure/prisma-company-namer.ts",
    {
      calls: 1,
      reason:
        "nomme les sujets d'un fait du journal : un fait passé garde son nom ; le tunnel et le cockpit écartent par ArchivedCompaniesReader",
    },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/growth/infrastructure/prisma-sales-day.reader.ts",
    {
      calls: 1,
      reason:
        "`touched` : les sociétés d'un contact noté ou d'un rendez-vous honoré — un geste fait reste un geste du jour",
    },
  ],
  // — Des sociétés déjà ouvertes par un mur, ou de la structure.
  [
    "apps/lfd-api/src/lafoliecoffee/account/infrastructure/prisma-account.reader.ts",
    { calls: 1, reason: "les sites que `readReachableSites` a déjà ouverts (`openCompanyWhere`)" },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/account/infrastructure/company-hierarchy.projection.ts",
    {
      calls: 1,
      reason: "les sites d'une fiche : un supprimé n'est jamais site (refusé au rattachement)",
    },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/account/infrastructure/prisma-company-opener-backfill.ts",
    {
      calls: 1,
      reason: "rattrapage d'auteur, rejoué à la main : il complète une colonne, ne montre rien",
    },
  ],
  [
    "apps/lfd-api/src/lafoliecoffee/client-notes/infrastructure/prisma-notebook-companies.ts",
    {
      calls: 1,
      reason:
        "« la société existe-t-elle ? » : la fiche d'un supprimé s'ouvre encore, ses notes avec",
    },
  ],
  // — À écarter, laissé intact : le fichier est tenu par une autre session.
  [
    "apps/lfd-api/src/lafoliecoffee/account/infrastructure/prisma-direct-debit-block.reader.ts",
    {
      calls: 1,
      reason:
        "À ÉCARTER (page des blocages du prélèvement) : laissé intact le 2026-11-22, les prélèvements d'`account` étant en cours ailleurs",
    },
  ],
  // — Le semis de démonstration.
  [
    "apps/lfd-api/src/dev/seeding/invoices.seed.ts",
    { calls: 1, reason: "semis local : il facture les sociétés qu'il vient de semer" },
  ],
  [
    "apps/lfd-api/src/dev/seeding/reset.seed.ts",
    { calls: 1, reason: "remise à blanc locale : elle doit voir toutes les sociétés" },
  ],
]);

const CALL = /\.company\.(findMany|count|groupBy|aggregate)\s*\(/g;

/**
 * Ce qui, dans un `where`, dit le sort d'un compte supprimé : la colonne, ou
 * un prédicat nommé qui la porte (`openCompanyWhere` écarte aussi le résilié,
 * et c'est le choix des murs ; `inheritedSiteWhere` le compose).
 */
const NAMES_ARCHIVE = ["archivedAt", "openCompanyWhere(", "inheritedSiteWhere("];

/**
 * Le `where` de PREMIER niveau de l'argument, ou `""`. Un `archivedAt` d'une
 * relation choisie (`addresses: { where: { archivedAt: null } }`) n'y est pas :
 * il parle de l'adresse, pas de la société.
 */
export function topLevelWhere(args) {
  let depth = 0;
  for (let index = 0; index < args.length; index += 1) {
    const char = args[index];
    if ("({[".includes(char)) {
      depth += 1;
    } else if (")}]".includes(char)) {
      depth -= 1;
    } else if (
      depth === 2 &&
      args.startsWith("where", index) &&
      /^where\s*:/.test(args.slice(index))
    ) {
      const start = args.indexOf(":", index) + 1;
      let inner = 0;
      for (let end = start; end < args.length; end += 1) {
        const next = args[end];
        if ("({[".includes(next)) {
          inner += 1;
        } else if (")}]".includes(next)) {
          if (inner === 0) {
            return args.slice(start, end);
          }
          inner -= 1;
        } else if (next === "," && inner === 0) {
          return args.slice(start, end);
        }
      }
    }
  }
  return "";
}

/** L'argument de l'appel, borné par ses parenthèses — pas par un compte de lignes. */
export function callArguments(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex, index + 1);
      }
    }
  }
  return source.slice(openIndex);
}

function* files(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) {
        yield* files(path);
      }
      continue;
    }
    if (path.endsWith(".ts") && !path.endsWith(".spec.ts")) {
      yield path;
    }
  }
}

/**
 * Les appels de ces fichiers qui ne nomment pas le compte supprimé, par
 * fichier — `files` : `{ path, source }`.
 */
export function unnamedCalls(files) {
  const unnamed = new Map();
  let checked = 0;
  for (const { path, source } of files) {
    for (const match of source.matchAll(CALL)) {
      checked += 1;
      const args = callArguments(source, match.index + match[0].length - 1);
      const where = topLevelWhere(args);
      if (!NAMES_ARCHIVE.some((name) => where.includes(name))) {
        const line = source.slice(0, match.index).split("\n").length;
        unnamed.set(path, [...(unnamed.get(path) ?? []), `${path}:${line}  (${match[1]})`]);
      }
    }
  }
  return { unnamed, checked };
}

/** Les refus : un appel hors liste, un compte qui dépasse, une entrée périmée. */
export function verdict(unnamed, admittedList = ADMITTED) {
  const failures = [];
  for (const [path, calls] of unnamed) {
    const admitted = admittedList.get(path);
    if (admitted === undefined) {
      failures.push(...calls.map((call) => `${call} — ne nomme pas \`archivedAt\``));
    } else if (calls.length > admitted.calls) {
      failures.push(
        `${path} — ${calls.length} appels sans \`archivedAt\`, ${admitted.calls} admis :\n      ${calls.join("\n      ")}`,
      );
    }
  }
  for (const [path, admitted] of admittedList) {
    const found = unnamed.get(path)?.length ?? 0;
    if (found < admitted.calls) {
      failures.push(
        `${path} — admis pour ${admitted.calls} appel(s), il n'en reste que ${found} : ajuster ou retirer l'entrée`,
      );
    }
  }
  return failures;
}

function main() {
  const sources = [...files(join(ROOT, SCAN))].map((path) => ({
    path: relative(ROOT, path),
    source: readFileSync(path, "utf8"),
  }));
  const { unnamed, checked } = unnamedCalls(sources);
  const failures = verdict(unnamed);
  if (failures.length > 0) {
    console.error(
      "\n✖ company-archived-views : une liste de sociétés oublie le compte supprimé.\n",
    );
    for (const failure of failures) {
      console.error(`    ${failure}`);
    }
    console.error(
      "\n  Nommer `archivedAt` dans le `where` (`archivedAt: null` pour écarter un",
      "\n  compte supprimé), ou inscrire le fichier dans ADMITTED avec sa raison.\n",
    );
    process.exit(1);
  }
  const admittedCalls = [...ADMITTED.values()].reduce((total, entry) => total + entry.calls, 0);
  console.log(
    `✓ company-archived-views : ${checked} listes de sociétés, ${checked - admittedCalls} nomment le compte supprimé, ${admittedCalls} admises avec leur raison.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

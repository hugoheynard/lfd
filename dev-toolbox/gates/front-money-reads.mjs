#!/usr/bin/env node
/**
 * Gate : **un écran lit ses montants, il ne les calcule pas** (plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, § 8.1 et § 5).
 *
 * Le « Total HT » d'un pro au compte a eu, jusqu'au 2026-11-04, deux formules
 * à l'écran — « total − TVA », puis la règle du bon refaite sur les gestes —
 * pendant que le bon PDF, l'e-mail et le récapitulatif l'appliquaient au
 * serveur. Deux arithmétiques pour un même nombre finissent par diverger d'un
 * centime, et c'est le client qui le voit. Le serveur pose désormais
 * `pretaxCents` (et `voucherRemainderCents`) ; un écran les lit.
 *
 * ## Deux étages, parce que la règle est plus large que le lot qui l'a posée
 *
 * - **Refusé sans exception** : la forme exacte de ce que L6 a retiré —
 *   l'import de `orderPretaxCents` / `netArticlesCents`, `totalCents -`,
 *   `- …vatCents`, `vat.reduce(`. Aucun fichier n'a le droit d'y revenir.
 * - **Dette comptée, en baisse seulement** (comme `lint:controller-buses`) :
 *   une somme `reduce(` dont l'accumulateur ajoute un champ `…Cents`. Les
 *   totaux de factures, de périodes, de dossier, de lot et de révision en
 *   portent encore — chacun un champ serveur à créer, un lot par écran (§ 6).
 *   Un fichier hors liste qui en gagne une échoue ; un fichier inscrit devenu
 *   propre échoue aussi, pour que la liste ne garde pas de place libre.
 *
 * Portée : `apps/*-frontend/src` et `packages/b2b-ui/src`, hors specs
 * (`*.spec.ts`, `__tests__/`) — une fixture a le droit de calculer son attendu.
 *
 * Usage : `pnpm lint:front-money-reads`. Tests :
 * `node --test dev-toolbox/__tests__/front-money-reads.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Les fichiers qui somment encore des centimes à l'écran, relevés au premier
 * passage de la porte (2026-11-04). En retirer un = avoir servi son total.
 */
export const DEBT = [
  "apps/lfc-ecommerce-frontend/src/app/client/mes-commandes/order-ticket.ts",
  "apps/lfc-ecommerce-frontend/src/app/client/mes-factures/invoices-page/invoices-page.ts",
  "apps/lfd-backoffice-frontend/src/app/comptabilite/delivery-vat-examples.ts",
  "apps/lfd-backoffice-frontend/src/app/comptabilite/invoice-dossier/dossier-orders/dossier-orders.ts",
  "apps/lfd-backoffice-frontend/src/app/comptabilite/order-delivery-vat/order-delivery-vat-page.ts",
  "apps/lfd-backoffice-frontend/src/app/fiche-client/detached-unpaid-card/detached-unpaid-card.ts",
  "apps/lfd-backoffice-frontend/src/app/fiche-client/facturation/billing-csv.ts",
  "apps/lfd-backoffice-frontend/src/app/fiche-client/facturation/billing-periods.ts",
  "apps/lfd-backoffice-frontend/src/app/fiche-client/facturation/facturation-page.ts",
  "packages/b2b-ui/src/order/order-sheet-ticket-text.ts",
];

/** Les formes refusées, chacune avec ce qu'il faut lire à la place. */
const REFUSED = [
  {
    pattern: /import\s[^;]*?\b(orderPretaxCents|netArticlesCents)\b[^;]*?from\s/g,
    message: "importe la règle du HT — lire `pretaxCents`, que le serveur a calculé",
  },
  {
    // L'écart entre DEUX totaux (un tri, une comparaison de deux régimes) ne
    // dérive pas un montant d'un total : il n'est pas la forme que L6 retire.
    pattern: /\btotalCents\s*-(?![-=])(?!\s*(?:[A-Za-z_$][\w$]*(?:\?\.|\.))*totalCents\b)/g,
    message: "« total moins … » — lire le champ que le serveur sert",
  },
  {
    pattern: /(?<![-+])-\s*(?:[A-Za-z_$][\w$]*(?:\?\.|\.|\(\)\.))*[A-Za-z_$]*[vV]atCents\b/g,
    message: "soustrait la TVA — lire le HT servi (`pretaxCents`)",
  },
  {
    pattern: /\bvat\s*\.\s*reduce\s*\(/g,
    message: "somme la TVA par taux — lire `vatCents` ou le champ servi",
  },
];

/** Les commentaires citent les formes refusées pour les expliquer : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

/** Le texte d'un appel, de la parenthèse ouvrante à sa fermante. */
function callText(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    if (source[i] === ")") depth -= 1;
    if (depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

/** Un `reduce(` dont le corps ajoute un champ `…Cents`. */
const ADDS_CENTS = /\+\s*(?:[A-Za-z_$][\w$]*(?:\?\.|\.))*[A-Za-z_$]*Cents\b/;

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Les formes refusées d'une source : `[ligne, message]`. */
export function refusedIn(raw) {
  const source = withoutComments(raw);
  const found = [];
  for (const { pattern, message } of REFUSED) {
    for (const match of source.matchAll(pattern)) {
      found.push([lineOf(source, match.index), message]);
    }
  }
  return found.sort((a, b) => a[0] - b[0]);
}

/** Les sommes de centimes d'une source : les lignes de leurs `reduce(`. */
export function centsSumsIn(raw) {
  const source = withoutComments(raw);
  const lines = [];
  for (const match of source.matchAll(/\.reduce\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    if (ADDS_CENTS.test(callText(source, open))) {
      lines.push(lineOf(source, match.index));
    }
  }
  return lines;
}

const WATCHED_APPS = "apps";
const WATCHED_PACKAGE = "packages/b2b-ui/src";

function isSpec(path) {
  return path.endsWith(".spec.ts") || path.includes("/__tests__/");
}

function typescriptFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...typescriptFiles(full));
    } else if (entry.endsWith(".ts") && !isSpec(full.replace(/\\/g, "/"))) {
      out.push(full);
    }
  }
  return out;
}

/** `apps/*-frontend/src` et `packages/b2b-ui/src`. */
export function watchedFiles(root) {
  const fronts = readdirSync(join(root, WATCHED_APPS))
    .filter((name) => name.endsWith("-frontend"))
    .map((name) => join(root, WATCHED_APPS, name, "src"));
  return [...fronts, join(root, WATCHED_PACKAGE)].flatMap(typescriptFiles);
}

/** Le verdict, pur : ce qui échoue, et la dette restante. */
export function verdict(files, debt) {
  const failures = [];
  const remaining = [];
  const indebted = new Set();
  for (const { path, source } of files) {
    for (const [line, message] of refusedIn(source)) {
      failures.push(`${path}:${line}  ${message}`);
    }
    const sums = centsSumsIn(source);
    if (sums.length === 0) continue;
    indebted.add(path);
    if (debt.includes(path)) {
      remaining.push([path, sums.length]);
    } else {
      failures.push(
        `${path}:${sums[0]}  somme des centimes à l'écran — servir le total au serveur ` +
          `(hors liste de dette : une liste qui ne fait que décroître)`,
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

function main() {
  const root = process.cwd();
  const files = watchedFiles(root).map((full) => ({
    path: relative(root, full).replace(/\\/g, "/"),
    source: readFileSync(full, "utf8"),
  }));
  const { failures, remaining } = verdict(files, DEBT);
  if (failures.length > 0) {
    console.error("\n✗ front-money-reads\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). Un écran lit ses montants : le serveur les calcule ` +
        `(le-prix-d-un-panier.md).\n`,
    );
    process.exit(1);
  }
  const total = remaining.reduce((sum, [, count]) => sum + count, 0);
  console.log(
    `✓ front-money-reads : ${files.length} fichier(s) lus, aucune forme refusée.\n` +
      `  Dette : ${remaining.length} fichier(s), ${total} somme(s) de centimes — compté, pas ignoré.`,
  );
  for (const [path, count] of remaining) console.log(`    ${path}  (${count})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

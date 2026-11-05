#!/usr/bin/env node
/**
 * Gate : **un lecteur de la boutique lit l'espace par la brique** (décidée par
 * Hugo le 2026-11-05 ; plan `documentation/caching-usage/plan-espace-retenu.md`,
 * § 00 bis et § 00 ter, lot d).
 *
 * Chaque store lisait l'espace à sa façon : son `effect` sur
 * `ClientWorkspace`, sa clé maison (`readFor`, `loadedFor`, `photoFor`), son
 * « déjà demandé », son état périmé — trente-sept fichiers pour une seule
 * règle, et chacun pouvait rendre, le temps d'une requête, ce qu'il avait lu
 * pour l'espace d'où l'on venait. La brique (`client/context-keyed/`) tient
 * cette règle une fois : la lecture se range sous la clé de
 * `ClientContext.prefix()`, et rien n'est rendu pour un autre espace que celui
 * qui s'affiche.
 *
 * ## Ce que la porte refuse
 *
 * - un fichier qui cite `ClientWorkspace` (import, `inject`, type) ;
 * - un fichier qui déclare une clé maison `readFor`, `loadedFor` ou `photoFor` ;
 * - `workspaceHeadersOf` hors de `context-keyed.ts` : l'en-tête d'une lecture
 *   s'écrit par `workspaceRequestOf`, qui pose aussi le marqueur « sans
 *   espace » — l'en-tête seul laisserait l'intercepteur compléter.
 *
 * ## Deux listes
 *
 * - **ADMITTED** : ceux dont le travail EST l'espace (l'intercepteur, la
 *   garde, la bascule, les menus qui le choisissent) et les écritures que le
 *   lot d exclut — chacun avec sa raison. La brique ne s'y applique pas.
 * - **DEBT** : les lecteurs pas encore migrés, comptés et affichés à chaque
 *   exécution. Un fichier hors des deux listes qui gagne une violation
 *   échoue ; un fichier de la dette devenu propre échoue aussi, pour qu'on le
 *   raye (le motif de `lint:front-money-reads`).
 *
 * Portée : `apps/lfc-ecommerce-frontend/src/app/**.ts`, hors `*.spec.ts` et
 * `*.fixture.ts`. Les commentaires sont blanchis : ils citent l'ancienne
 * mécanique pour l'expliquer.
 *
 * Usage : `pnpm lint:context-keyed-readers`. Tests :
 * `node --test dev-toolbox/__tests__/context-keyed-readers.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP = "apps/lfc-ecommerce-frontend/src/app";

/** La brique elle-même : seule à écrire l'en-tête d'espace d'une lecture. */
const BRICK = `${APP}/client/context-keyed/context-keyed.ts`;

/**
 * Ceux dont le métier EST l'espace, ou que le lot d exclut parce qu'ils
 * écrivent. Une entrée finissant par `/` couvre un dossier.
 */
export const ADMITTED = {
  [`${APP}/client/client-workspace.interceptor.ts`]:
    "l'intercepteur pose l'en-tête de l'espace courant sur ce qui ne passe pas par la brique",
  [`${APP}/client/client-workspace.guard.ts`]:
    "la garde décide de l'espace d'une route avant qu'aucun lecteur ne lise",
  [`${APP}/client/client-workspace.service.ts`]: "l'espace lui-même",
  [`${APP}/client/client-workspace-switch.service.ts`]:
    "la bascule : elle écrit l'espace et ordonne le détour de rechargement",
  [`${APP}/client/client-context.service.ts`]:
    "le contexte que la brique lit : il dérive son préfixe de l'espace",
  [`${APP}/client/nav/client-menu/client-menu.ts`]: "le menu choisit l'espace",
  [`${APP}/client/shell/account-menu/account-menu.ts`]: "le menu du compte choisit l'espace",
  [`${APP}/client/shop/public-house-picker-dialog/public-house-picker-dialog.ts`]:
    "le sélecteur de maison choisit l'espace",
  [`${APP}/client/nav/client-nav.service.ts`]: "la navigation dépend de l'espace choisi",
  [`${APP}/client/company-screens.ts`]:
    "les écrans d'une société se règlent sur l'espace, ils ne lisent rien",
  [`${APP}/client/workspace-reload/`]: "le détour de routeur de la bascule",
  [`${APP}/client/cart/shop-cart-sync.service.ts`]:
    "écriture du panier — exclue du lot d (§ 00 ter : les écritures restent des services)",
  [`${APP}/client/cart/shop-quote.service.ts`]:
    "le devis est un POST à anti-rebond conditionnel — exclu (§ 00 ter, contredit par vitruve)",
  [`${APP}/client/cart/staff-cart-suggestion.service.ts`]: "écrit dans le panier — exclu du lot d",
  [`${APP}/client/commande/reglement-page/reglement-page.ts`]:
    "le règlement écrit une commande — exclu du lot d",
  [`${APP}/client/cart/cart-summary/cart-summary.ts`]: "résumé du panier — exclu avec le panier",
  [`${APP}/client/client-orders.service.ts`]:
    "la passation écrit une commande (POST idempotent, espace capturé au clic) — exclue comme le règlement (2026-11-05)",
  [`${APP}/client/order-context.store.ts`]:
    "efface le choix de service au DÉPART d'une bascule (D7) : une écriture qui suit l'espace en direct, pas une lecture (2026-11-05)",
};

/** Les lecteurs pas encore migrés vers la brique (relevés le 2026-11-05). En retirer un = l'avoir migré. */
export const DEBT = [
  `${APP}/client/accueil-public/accueil-public.ts`,
  `${APP}/client/cart/voucher-choice.service.ts`,
  `${APP}/client/client-audience.service.ts`,
  `${APP}/client/client-company.service.ts`,
  `${APP}/client/shop/shop-catalogue.store.ts`,
];

/** Les commentaires citent l'ancienne mécanique pour l'expliquer : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

const RULES = [
  {
    pattern: /\bClientWorkspace\b/g,
    message: "lit `ClientWorkspace` — lire par la brique (`contextKeyed`)",
  },
  {
    // Une déclaration : champ de classe, variable, ou membre d'un objet d'état.
    pattern:
      /(?:^|[\s;{,(])(?:(?:private|protected|public|readonly|static|let|const|var)\s+)*(readFor|loadedFor|photoFor)\s*[?!]?\s*[:=]/gm,
    message: "déclare une clé maison — la brique range par clé de contexte",
  },
];

const HEADERS = /\bworkspaceHeadersOf\b/g;

/** Les violations d'une source : `[ligne, message]`. */
export function violationsIn(raw, path = "") {
  const source = withoutComments(raw);
  const found = [];
  for (const { pattern, message } of RULES) {
    for (const match of source.matchAll(pattern)) {
      found.push([lineOf(source, match.index), message]);
    }
  }
  if (path !== BRICK) {
    for (const match of source.matchAll(HEADERS)) {
      found.push([
        lineOf(source, match.index),
        "`workspaceHeadersOf` hors de la brique — écrire `workspaceRequestOf(key, …)`",
      ]);
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
    const found = violationsIn(source, path);
    if (found.length === 0 || isAdmitted(path, admitted)) continue;
    indebted.add(path);
    if (debt.includes(path)) {
      remaining.push([path, found.length]);
    } else {
      for (const [line, message] of found) {
        failures.push(
          `${path}:${line}  ${message} (hors liste de dette : elle ne fait que décroître)`,
        );
      }
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
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...typescriptFiles(full));
    } else if (
      entry.endsWith(".ts") &&
      !entry.endsWith(".spec.ts") &&
      !entry.endsWith(".fixture.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const root = process.cwd();
  const missing = Object.keys(ADMITTED).filter((entry) => {
    try {
      statSync(join(root, entry));
      return false;
    } catch {
      return true;
    }
  });
  const files = typescriptFiles(join(root, APP)).map((full) => ({
    path: relative(root, full).replace(/\\/g, "/"),
    source: readFileSync(full, "utf8"),
  }));
  const { failures, remaining } = verdict(files, DEBT, ADMITTED);
  for (const entry of missing) {
    failures.push(`${entry}  admis mais introuvable — déplacé ? corriger ADMITTED`);
  }
  if (failures.length > 0) {
    console.error("\n✗ context-keyed-readers\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). Un lecteur lit l'espace par la brique ` +
        `(client/context-keyed/ — plan-espace-retenu.md, lot d).\n`,
    );
    process.exit(1);
  }
  const total = remaining.reduce((sum, [, count]) => sum + count, 0);
  console.log(
    `✓ context-keyed-readers : ${files.length} fichier(s) lus, ` +
      `${Object.keys(ADMITTED).length} admis.\n` +
      `  Dette : ${remaining.length} fichier(s), ${total} lecture(s) hors brique — compté, pas ignoré.`,
  );
  for (const [path, count] of remaining) console.log(`    ${path}  (${count})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

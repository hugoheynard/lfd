#!/usr/bin/env node
/**
 * Gate : **« trop tard ? » se demande au délai de commande** (plan
 * `documentation/limites-de-commande/extraire-le-jugement-de-l-heure-limite.md`,
 * § 3.7).
 *
 * Le jugement de l'heure limite vit dans `order-cutoffs/domain/deadline/` (le
 * juge pur) et se demande par `OrderDeadline`. Recopier la décision ailleurs —
 * la plus fermée du panier, le rattrapage forcé à zéro sur un article, la
 * dérogation qui n'ouvre que le rattrapage — est la façon dont elle a déjà
 * divergé une fois.
 *
 * ## Ce que la porte refuse
 *
 * Dans `apps/lfd-api/src` et `apps/lfd-api/test`, tests compris :
 *
 * - importer l'ancien jugement : `order-cutoff-guard`, `order-cutoff-gate.service`,
 *   `late-fee-judgement.service` ;
 * - importer de `@lfd/contracts` une fonction de décision (`decideOrderCutoff`,
 *   `decideOrderLimit`) hors du juge.
 *
 * ## Deux listes
 *
 * - **ADMITTED** : le juge, et les annonceurs qui lisent une règle sans juger
 *   de panier, chacun avec sa raison.
 * - **DEBT** : les fichiers qui importent encore l'ancien jugement, relevés le
 *   2026-11-19 au lot V3. Un fichier hors des deux listes échoue ; un fichier
 *   de la dette devenu propre échoue aussi, pour qu'on le raye. La liste ne
 *   grandit pas, elle se vide — vide au lot V7.
 *
 * Elle ne voit pas un lecteur qui recopierait la comparaison à la main : il
 * n'y aura plus rien à recopier, les trois états vivant dans
 * `decideOrderLimit` et le choix de la plus fermée dans le juge.
 *
 * Usage : `pnpm gate order-deadline-door`. Tests :
 * `node --test dev-toolbox/__tests__/order-deadline-door.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const API = "apps/lfd-api";
const ROOTS = [`${API}/src`, `${API}/test`];
const DEADLINE = `${API}/src/lafoliecoffee/order-cutoffs/domain/deadline/`;

/** Ceux dont le travail est de décider, ou d'annoncer une règle sans juger de panier. */
export const ADMITTED = {
  [DEADLINE]: "le juge pur : la décision vit ici",
};

/** Les fichiers qui importent encore l'ancien jugement (relevés le 2026-11-19, V3). */
export const DEBT = [
  "apps/lfd-api/src/lafoliecoffee/orders/application/services/__tests__/late-fee-judgement.doubles.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/application/services/__tests__/shop-cart-quoting.doubles.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/application/services/late-fee-judgement.service.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/application/services/order-cutoff-gate.service.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/application/services/order-cutoff-notice.service.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/application/services/shop-cart-quoting.service.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/domain/services/__tests__/order-cutoff-guard-foreseen.spec.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/domain/services/__tests__/order-cutoff-guard.spec.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/domain/services/order-cutoff-guard.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/domain/services/settlement-reminder.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/orders.module.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/revision/application/commands/__tests__/card-increase-scene.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/revision/application/commands/__tests__/revision-scene.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/revision/application/commands/propose-card-increase.handler.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/revision/application/services/order-revising.service.ts",
  "apps/lfd-api/src/lafoliecoffee/orders/revision/order-revision.providers.ts",
  "apps/lfd-api/src/lafoliecoffee/recommendations/domain/orderable-today.ts",
  "apps/lfd-api/test/pricing-golden-master-pairs.ts",
];

/** Les modules de l'ancien jugement, par la fin de leur chemin. */
const OLD_JUDGEMENT =
  /["'][^"']*\/(order-cutoff-guard|order-cutoff-gate\.service|late-fee-judgement\.service)\.js["']/g;

/** Les fonctions de décision du contrat. */
const DECIDERS = /\b(decideOrderCutoff|decideOrderLimit)\b/g;

const CONTRACTS_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@lfd\/contracts["']/g;

/** Les commentaires citent l'ancien jugement pour l'expliquer : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Ce qu'une source importe du jugement : `[ligne, nom]`. */
export function judgementImportsIn(raw) {
  const source = withoutComments(raw);
  const found = [];
  for (const match of source.matchAll(OLD_JUDGEMENT)) {
    found.push([lineOf(source, match.index), match[1]]);
  }
  for (const match of source.matchAll(CONTRACTS_IMPORT)) {
    for (const name of match[1].matchAll(DECIDERS)) {
      found.push([lineOf(source, match.index), name[1]]);
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
    const found = judgementImportsIn(source);
    if (found.length === 0 || isAdmitted(path, admitted)) continue;
    indebted.add(path);
    if (debt.includes(path)) {
      remaining.push(path);
      continue;
    }
    for (const [line, name] of found) {
      failures.push(
        `${path}:${line}  importe ${name} — demander le verdict à \`OrderDeadline\` ` +
          "(lafoliecoffee/order-cutoffs/index.ts) ; la dette ne fait que décroître",
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
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...typescriptFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const root = process.cwd();
  const files = ROOTS.flatMap((dir) => typescriptFiles(join(root, dir))).map((full) => ({
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
    console.error("\n✗ order-deadline-door\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${failures.length} écart(s). « Trop tard ? » se demande au délai de commande ` +
        "(extraire-le-jugement-de-l-heure-limite.md, § 3.7).\n",
    );
    process.exit(1);
  }
  console.log(
    `✓ order-deadline-door : ${files.length} fichier(s) lus, aucun jugement neuf hors du délai de commande.\n` +
      `  Dette : ${remaining.length} fichier(s) lisent encore l'ancien jugement — compté, pas ignoré.`,
  );
  for (const path of remaining) console.log(`    ${path}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

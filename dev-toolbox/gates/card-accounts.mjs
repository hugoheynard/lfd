#!/usr/bin/env node
/**
 * Gate : **les comptes d'encaissement du registre sont ceux que la base admet.**
 *
 * Plan `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.2 et §4.1 (2026-11-09). Un compte d'encaissement par carte a deux
 * moitiés : son nom dans le registre du dépôt
 * (`apps/lfd-api/src/platform/config/card-accounts.ts`, `CARD_ACCOUNTS`) et
 * sa place dans le `CHECK payment_account_known` de `card_payment.payment`
 * (la dernière migration qui le pose). Rien ne relie les deux :
 *
 * - un compte au registre et absent du CHECK s'instancie, crée des intentions
 *   chez le prestataire, et la ligne qui devait les rattacher est refusée
 *   par la base — au premier paiement, en production ;
 * - un compte admis par la base et absent du registre laisse des paiements
 *   que plus aucun adaptateur ne sait relire, rembourser ni vérifier.
 *
 * La porte exige l'ÉGALITÉ STRICTE des deux listes. Un compte neuf est donc
 * une entrée au registre ET une migration qui élargit le CHECK, dans le même
 * passage.
 *
 * Usage : `pnpm gate card-accounts`. Tests :
 * `node --test dev-toolbox/__tests__/card-accounts.test.mjs`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REGISTRY = "apps/lfd-api/src/platform/config/card-accounts.ts";
export const MIGRATIONS = "apps/lfd-api/prisma/migrations";
export const CONSTRAINT = "payment_account_known";

/** Les noms de `CARD_ACCOUNTS`, dans l'ordre du fichier ; `null` si le tableau manque. */
export function registryAccounts(source) {
  const block = /export const CARD_ACCOUNTS = \[([\s\S]*?)\] as const;/u.exec(source);
  if (block === null) {
    return null;
  }
  return [...block[1].matchAll(/\bname:\s*"([^"]+)"/gu)].map((match) => match[1]);
}

/**
 * Les comptes du dernier `CHECK payment_account_known` d'un `migration.sql`,
 * ou `null` s'il n'en pose aucun. Lit `CHECK ("account" IN ('a', 'b'))`, que
 * la contrainte naisse avec la table ou par `ADD CONSTRAINT`.
 */
export function checkAccounts(sql) {
  const pattern = new RegExp(
    `"${CONSTRAINT}"\\s+CHECK\\s*\\(\\s*"account"\\s+IN\\s*\\(([^)]*)\\)\\s*\\)`,
    "gu",
  );
  const found = [...sql.matchAll(pattern)].at(-1);
  if (found === undefined) {
    return null;
  }
  return [...found[1].matchAll(/'([^']*)'/gu)].map((match) => match[1]);
}

/** Les écarts entre le registre et le CHECK — vide quand ils s'accordent. */
export function accountDrift(registry, check) {
  const problems = [];
  const duplicates = registry.filter((name, index) => registry.indexOf(name) !== index);
  for (const name of new Set(duplicates)) {
    problems.push(`« ${name} » est déclaré deux fois au registre.`);
  }
  for (const name of registry.filter((candidate) => !check.includes(candidate))) {
    problems.push(
      `« ${name} » est au registre mais pas dans le CHECK ${CONSTRAINT} : ` +
        "ses paiements seraient refusés par la base. Ajouter la migration qui élargit le CHECK.",
    );
  }
  for (const name of check.filter((candidate) => !registry.includes(candidate))) {
    problems.push(
      `« ${name} » est admis par le CHECK ${CONSTRAINT} mais absent du registre : ` +
        "ses paiements ne seraient relus par aucun adaptateur. L'ajouter à CARD_ACCOUNTS.",
    );
  }
  return problems;
}

/** Le CHECK de la dernière migration qui le pose : `{ migration, accounts }`, ou `null`. */
export function latestCheck(root) {
  const dir = join(root, MIGRATIONS);
  const migrations = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  let latest = null;
  for (const migration of migrations) {
    const file = join(dir, migration, "migration.sql");
    if (!existsSync(file)) {
      continue;
    }
    const accounts = checkAccounts(readFileSync(file, "utf8"));
    if (accounts !== null) {
      latest = { migration, accounts };
    }
  }
  return latest;
}

function main() {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const registry = registryAccounts(readFileSync(join(root, REGISTRY), "utf8"));
  if (registry === null) {
    console.error(
      `✗ card-accounts : \`export const CARD_ACCOUNTS = [ … ] as const;\` introuvable dans ${REGISTRY}.`,
    );
    process.exit(1);
  }
  const check = latestCheck(root);
  if (check === null) {
    console.error(
      `✗ card-accounts : aucune migration ne pose le CHECK ${CONSTRAINT} (${MIGRATIONS}).`,
    );
    process.exit(1);
  }
  const problems = accountDrift(registry, check.accounts);
  if (problems.length > 0) {
    console.error(
      `✗ card-accounts : le registre (${REGISTRY}) et le CHECK de ${check.migration} divergent.\n`,
    );
    for (const problem of problems) {
      console.error(`  ${problem}`);
    }
    process.exit(1);
  }
  console.log(
    `✓ card-accounts : ${registry.length} compte(s) — le registre et le CHECK de ${check.migration} s'accordent.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

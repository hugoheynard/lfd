import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaOrderDiscountBackfill } from "../src/b2b/orders/infrastructure/prisma-order-discount-backfill.js";
import {
  PrismaOrderDiscountTermsBackfill,
  termsBackfillReport,
} from "../src/b2b/orders/infrastructure/prisma-order-discount-terms-backfill.js";
import { PrismaClient } from "../src/platform/database/client/client.js";
import { UlidGenerator } from "../src/platform/id/ulid-generator.js";
import { SystemClock } from "../src/platform/time/system-clock.js";
import {
  assertBackfillTarget,
  backfillReport,
  parseBackfillArgs,
  refreshReport,
} from "./backfill-order-discounts-options.js";

/**
 * **Reprise des remises de panier** — `documentation/promotions/promotions.md`, § 2.12, lot M2. `pnpm --filter lfd-api backfill:order-discounts`.
 *
 * Pour chaque commande remisée sans remise active : recompose la remise par
 * la fonction de M1 et la compare au figé ; à l'égalité écrit une ligne
 * `computed`, sinon une ligne `frozen` recopiée des colonnes figées, ou rien
 * (commande à plusieurs taux en écart, listée « à trancher »). Rejouable.
 *
 * - À blanc par défaut ; `--write` après lecture du compte par Hugo.
 * - Cible locale seulement, sauf `--production <nom de la base>` retapé.
 * - `--refresh-drifted` (M3) : archive les remises périmées d'une commande
 *   révisée par l'ancien code et la reprend — à blanc d'abord, comme le reste.
 *   Le temps 5 du runbook exige zéro écart ET zéro désaccord.
 * - Runbook en cinq temps : § 18.3 (première passe après M2, seconde après M3,
 *   le déclencheur seulement si la seconde ne laisse aucune commande sans ligne).
 * - Puis, à chaque passe, les **termes figés** des remises actives qui n'en ont
 *   pas (`documentation/promotions/plan-remises-acquises.md`, § 10.3) :
 *   déduits de leur promotion, archivée comprise, et marqués `backfilled`. À
 *   blanc comme le reste ; une remise sans promotion reste sans termes.
 *
 * Il ne démarre PAS l'`AppModule` (contrairement à `backfill-naf.ts`) : ses
 * tâches de fond tourneraient contre la base visée, production comprise. Un
 * client Prisma nu suffit — l'arithmétique est celle du domaine, importée.
 */
async function main(): Promise<void> {
  const options = parseBackfillArgs(process.argv.slice(2));
  const url = process.env["DATABASE_LFD_URL"] ?? "";
  assertBackfillTarget(url, options);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const clock = new SystemClock();
    const backfill = new PrismaOrderDiscountBackfill(prisma, new UlidGenerator(clock), clock);
    const lines = [];
    for (const orderId of await backfill.pendingOrderIds()) {
      lines.push(await backfill.recover(orderId, options.write));
    }
    const report = [...backfillReport(lines, await backfill.drifted(), options.write)];
    if (options.refreshDrifted) {
      const refreshed = [];
      for (const order of await backfill.drifted()) {
        refreshed.push(await backfill.refresh(order.orderId, options.write));
      }
      report.push(...refreshReport(refreshed, options.write));
    }
    // Après les remises : une remise que cette passe vient d'écrire a, elle
    // aussi, ses termes à déduire (à blanc, elle n'existe pas encore).
    const terms = new PrismaOrderDiscountTermsBackfill(prisma);
    const filled = [];
    for (const discountId of await terms.pendingDiscountIds()) {
      filled.push(await terms.fill(discountId, options.write));
    }
    report.push(...termsBackfillReport(filled, options.write));
    for (const text of report) {
      console.log(text);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("reprise des remises : échec", error);
  process.exitCode = 1;
});

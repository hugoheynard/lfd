import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaOrderDiscountBackfill } from "../src/b2b/orders/infrastructure/prisma-order-discount-backfill.js";
import { PrismaClient } from "../src/platform/database/client/client.js";
import { UlidGenerator } from "../src/platform/id/ulid-generator.js";
import { SystemClock } from "../src/platform/time/system-clock.js";
import {
  assertBackfillTarget,
  backfillReport,
  parseBackfillArgs,
} from "./backfill-order-discounts-options.js";

/**
 * **Reprise des remises de panier** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.3, lot M2. `pnpm --filter lfd-api backfill:order-discounts`.
 *
 * Pour chaque commande remisée sans remise active : recompose la remise par
 * la fonction de M1 et la compare au figé ; à l'égalité écrit une ligne
 * `computed`, sinon une ligne `frozen` recopiée des colonnes figées, ou rien
 * (commande à plusieurs taux en écart, listée « à trancher »). Rejouable.
 *
 * - À blanc par défaut ; `--write` après lecture du compte par Hugo.
 * - Cible locale seulement, sauf `--production <nom de la base>` retapé.
 * - Runbook en cinq temps : § 18.3 (première passe après M2, seconde après M3,
 *   le déclencheur seulement si la seconde ne laisse aucune commande sans ligne).
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
    const backfill = new PrismaOrderDiscountBackfill(prisma, new UlidGenerator(new SystemClock()));
    const lines = [];
    for (const orderId of await backfill.pendingOrderIds()) {
      lines.push(await backfill.recover(orderId, options.write));
    }
    const drifted = await backfill.drifted();
    for (const text of backfillReport(lines, drifted, options.write)) {
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

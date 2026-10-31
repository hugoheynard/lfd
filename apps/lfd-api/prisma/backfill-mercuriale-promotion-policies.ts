import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaPromotionPolicyBackfill } from "../src/b2b/pricing/infrastructure/prisma-promotion-policy-backfill.js";
import { PrismaClient } from "../src/platform/database/client/client.js";
import { UlidGenerator } from "../src/platform/id/ulid-generator.js";
import { SystemClock } from "../src/platform/time/system-clock.js";
import {
  assertPolicyBackfillTarget,
  parsePolicyBackfillArgs,
  policyBackfillReport,
} from "./backfill-mercuriale-promotion-policies-options.js";

/**
 * **Reprise des politiques de promotions des mercuriales** —
 * `documentation/promotions/plan-la-mercuriale-decide.md`, § 8.
 * `pnpm --filter lfd-api backfill:mercuriale-promotion-policies`.
 *
 * Pour chaque mercuriale en cours ou à venir, et chaque brouillon, encore à
 * « Aucune » et sans avenant qui règle la politique : « Au choix » avec les
 * promotions non archivées cochées « aussi pour les tarifs négociés » qui
 * visent sa société par leur public ; sinon rien (elle reste « Aucune »).
 * Rejouable : une ligne déjà réglée n'est plus touchée.
 *
 * - À blanc par défaut ; `--write` après lecture du compte par Hugo.
 * - Cible locale seulement, sauf `--production <nom de la base>` retapé.
 * - À jouer juste après le déploiement de `20261101090000_la_mercuriale_decide` :
 *   d'ici là, ces promotions ne passent plus sur les tarifs négociés.
 *
 * Il ne démarre PAS l'`AppModule` : ses tâches de fond tourneraient contre la
 * base visée. Un client Prisma nu suffit — le jugement est celui du domaine.
 */
async function main(): Promise<void> {
  const options = parsePolicyBackfillArgs(process.argv.slice(2));
  const url = process.env["DATABASE_LFD_URL"] ?? "";
  assertPolicyBackfillTarget(url, options);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const clock = new SystemClock();
    const backfill = new PrismaPromotionPolicyBackfill(prisma, new UlidGenerator(clock), clock);
    const decisions = await backfill.plan();
    const written = new Set<string>();
    if (options.write) {
      for (const decision of decisions) {
        if (await backfill.apply(decision)) {
          written.add(decision.target.id);
        }
      }
    }
    for (const text of policyBackfillReport(decisions, written, options.write)) {
      console.log(text);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("reprise des politiques de promotions : échec", error);
  process.exitCode = 1;
});

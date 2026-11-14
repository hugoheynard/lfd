import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  planCompanyOpeners,
  staffDeclarationCoverage,
} from "../src/lafoliecoffee/account/infrastructure/company-opener-backfill-plan.js";
import { PrismaCompanyOpenerBackfill } from "../src/lafoliecoffee/account/infrastructure/prisma-company-opener-backfill.js";
import { PrismaClient } from "../src/platform/database/client/client.js";
import {
  assertOpenerBackfillTarget,
  openerBackfillReport,
  parseOpenerBackfillArgs,
} from "./backfill-company-openers-options.js";

/**
 * **Reprise de l'auteur et du suiveur des fiches existantes** —
 * `documentation/b2b/plan-suivi-commercial.md`, § 3.1.
 * `pnpm --filter lfd-api backfill:company-openers`.
 *
 * Pour chaque principal sans auteur : son fait `company.declared`, lu à part
 * dans `growth.activity_events` et joint en mémoire. Un acteur staff connu
 * devient l'auteur (nom figé du journal) et, faute de suiveur, le suiveur.
 * Tout le reste reste vide — jamais une valeur inventée. Rejouable.
 *
 * - À blanc par défaut : imprime ce qu'il écrirait, et combien de
 *   déclarations staff portent un acteur ; `--write` après lecture.
 * - Cible locale seulement, sauf `--production <nom de la base>` retapé.
 *
 * Il ne démarre PAS l'`AppModule` : ses tâches de fond tourneraient contre la
 * base visée. Un client Prisma nu suffit.
 */
async function main(): Promise<void> {
  const options = parseOpenerBackfillArgs(process.argv.slice(2));
  const url = process.env["DATABASE_LFD_URL"] ?? "";
  assertOpenerBackfillTarget(url, options);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const backfill = new PrismaCompanyOpenerBackfill(prisma);
    const companies = await backfill.companiesWithoutOpener();
    const declarations = await backfill.declarationsOf(companies.map((company) => company.id));
    const lines = planCompanyOpeners(companies, declarations);
    let written: number | null = null;
    if (options.write) {
      written = 0;
      for (const line of lines) {
        if (line.kind === "fill" && (await backfill.write(line))) {
          written += 1;
        }
      }
    }
    for (const text of openerBackfillReport(
      staffDeclarationCoverage(declarations),
      lines,
      written,
    )) {
      console.log(text);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("reprise de l'auteur des fiches : échec", error);
  process.exitCode = 1;
});

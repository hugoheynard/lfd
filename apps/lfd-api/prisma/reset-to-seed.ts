import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { resetToSeed } from "../src/dev/seeding/reset.seed.js";
import { PrismaClient } from "../src/platform/database/client/client.js";
import { refuseNonLocalTarget } from "./local-target.js";

/**
 * ⚠️ **Remet la base sur ce que le seed déclare** — l'inverse destructif de
 * `db:seed`, en ligne de commande.
 *
 * La logique vit dans `src/dev/seeding/reset.seed.ts`, partagée avec le bouton
 * du back-office : ce script n'est qu'une porte d'entrée, un garde-fou de cible,
 * et un compte rendu.
 */
async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_LFD_URL"] ?? "";
  refuseNonLocalTarget(
    connectionString,
    "ce script SUPPRIME des sociétés, des personnes et leurs commandes.",
  );

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const report = await resetToSeed(prisma);
    console.log(
      `✔ ${report.companies} société(s) et ${report.people} personne(s) supprimées, ` +
        `station élaguée de ${report.pickupPoints} point(s) et ${report.zones} zone(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("✗ reset échoué :", error);
  process.exitCode = 1;
});

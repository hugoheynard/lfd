import { config as loadEnv } from "dotenv";

// Mêmes fichiers, même ordre que `reset-to-seed.ts` : le `.env` du poste a le
// dernier mot sur `.env.development`, versionné.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.development" });

import { PrismaPg } from "@prisma/adapter-pg";

import { resetRolesToSeed } from "../src/dev/seeding/roles.seed.js";
import { PrismaClient } from "../src/platform/database/client/client.js";
import { refuseNonLocalTarget } from "./local-target.js";

/**
 * ⚠️ **Remet les rôles du code sur leur graine**, sur une base LOCALE — après
 * l'ajout d'une ressource, quand la base de dev répond 403 à tout rôle non
 * racine. La logique vit dans `src/dev/seeding/roles.seed.ts`, celle même que
 * le harnais e2e appelle.
 *
 * Ce qu'on avait réglé à l'écran sur ces rôles est ÉCRASÉ ; les rôles créés à
 * l'écran et les dérogations par personne ne sont pas touchés.
 */
async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_LFD_URL"] ?? "";
  refuseNonLocalTarget(
    connectionString,
    "ce script RÉÉCRIT les droits des rôles du code, réglés à l'écran ou non.",
  );
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const report = await resetRolesToSeed(prisma);
    console.log(`✔ créés : ${report.created.join(", ") || "aucun"}`);
    console.log(`✔ réécrits sur la graine : ${report.rewritten.join(", ") || "aucun"}`);
    console.log(
      `· créés à l'écran, laissés tels quels : ${report.untouched.join(", ") || "aucun"}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("✗ remise des rôles échouée :", error);
  process.exitCode = 1;
});

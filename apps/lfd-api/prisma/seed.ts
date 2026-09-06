import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/platform/database/client/client.js";
import { refuseNonLocalTarget } from "./local-target.js";
import { CLIENT_ENSEIGNE, seedClient } from "./seed-client.js";
import { seedStation } from "./seed-station.js";

/**
 * **Le seed de développement** — la station, puis le client de référence.
 *
 * ```bash
 * pnpm --filter lfd-api db:seed         # la station et le client
 * pnpm --filter lfd-api seed:orders     # ses commandes, calées sur aujourd'hui
 * pnpm --filter lfd-api db:seed:reset   # ⚠️ supprime tous les AUTRES clients
 * ```
 *
 * ## Ce qu'il pose
 *
 * - la **station** (`seed-station.ts`) : points de retrait avec leurs heures,
 *   zones de livraison, heure limite de commande ;
 * - le **client de référence** (`seed-client.ts`) : SAS Les Tommeuses, enseigne
 *   « La Folie Douce Val d'Isère », profil complet.
 *
 * Les **commandes** vivent à part (`seed-orders.ts`) parce qu'elles passent par
 * les vrais handlers, donc par l'injection Nest — ce que ce script, lancé par
 * `tsx`, ne peut pas porter.
 *
 * ## Additif, toujours
 *
 * Ce script ne supprime **rien** : ré-exécuté, il saute ce qui est déjà là et ne
 * touche à aucune saisie faite à la main. La suppression est un autre script,
 * qui porte son intention dans son nom.
 */
const url = process.env["DATABASE_LFD_URL"] ?? "";
refuseNonLocalTarget(url, "le seed écrit un client de développement et sa station.");

/**
 * 🔴 **Adaptateur `pg`, et non `accelerateUrl`.** Ce script posait
 * `new PrismaClient({ accelerateUrl: url })`, qui exige une URL `prisma://` —
 * il ne pouvait donc PAS tourner contre la base locale, seule cible que le
 * garde ci-dessus accepte. Les deux se contredisaient, et `pnpm db:seed`
 * échouait à sa première requête.
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main(): Promise<void> {
  await seedStation(prisma);
  const client = await seedClient(prisma);
  console.log(`\n✔ Base prête — ${CLIENT_ENSEIGNE} (société ${client.companyId}).`);
  console.log("  Étape suivante : pnpm --filter lfd-api seed:orders");
}

main()
  .catch((error: unknown) => {
    console.error("✗ Seed échoué :", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

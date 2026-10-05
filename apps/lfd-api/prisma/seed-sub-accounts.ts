import "dotenv/config";

import { seedSubAccounts } from "../src/dev/seeding/sub-accounts.seed.js";
import { refuseNonLocalTarget } from "./local-target.js";
import { bootstrapHarness } from "./seed-growth/harness.js";

/**
 * **Les sous-comptes de démonstration**, en ligne de commande —
 * `pnpm --filter lfd-api seed:sub-accounts`.
 *
 * La logique vit dans `src/dev/seeding/sub-accounts.seed.ts`. Un script à part
 * plutôt qu'une ligne de plus dans `seed:orders` : celui-ci ne touche ni au
 * fournil ni à la journée du jour, il se relance donc sans rejouer leur coupe.
 */
async function main(): Promise<void> {
  refuseNonLocalTarget(
    process.env["DATABASE_LFD_URL"] ?? "",
    "ce script efface les commandes des sous-comptes de démonstration avant de les reposer.",
  );

  const harness = await bootstrapHarness();
  try {
    // Le mur se lit ICI, une fois : une ligne de commande EST l'adaptateur de
    // son propre instant (`clock-port`).
    const report = await seedSubAccounts({
      prisma: harness.prisma,
      commands: harness.commands,
      now: new Date(),
      settle: () => harness.settle(),
    });
    console.log(
      `✔ Sous-comptes : « Alpes Chalets Privés » et ${String(report.chalets)} chalets (sites, ` +
        `facturés au principal), « Groupe Hôtelier des Cimes » (compte de groupe) et ` +
        `${String(report.hotels)} hôtels (entités, tarif du groupe suivi).\n` +
        `· ${String(report.removed)} commande(s) effacée(s), ${String(report.placed)} reposée(s) ` +
        `sur le mois dernier et ce mois-ci.`,
    );
  } finally {
    await harness.close();
  }
}

await main();

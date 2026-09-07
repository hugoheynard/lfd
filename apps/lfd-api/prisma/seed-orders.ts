import "dotenv/config";

import { seedOrders } from "../src/dev/seeding/orders.seed.js";
import { refuseNonLocalTarget } from "./local-target.js";
import { bootstrapHarness } from "./seed-growth/harness.js";

/**
 * **Les commandes du client de référence**, en ligne de commande.
 *
 * La logique vit dans `src/dev/seeding/orders.seed.ts`, partagée avec le bouton
 * du back-office. Ce script apporte ce que la ligne de commande n'a pas
 * autrement : un contexte applicatif Nest réel, donc le vrai `CommandBus`.
 */
async function main(): Promise<void> {
  refuseNonLocalTarget(
    process.env["DATABASE_LFD_URL"] ?? "",
    "ce script efface les commandes du client de développement avant de les reposer.",
  );

  const harness = await bootstrapHarness();
  try {
    // Le mur se lit ICI, une fois : une ligne de commande EST l'adaptateur de
    // son propre instant, et `src/` n'a pas le droit d'y toucher (`clock-port`).
    const report = await seedOrders({
      prisma: harness.prisma,
      commands: harness.commands,
      now: new Date(),
    });
    console.log(
      `· ${report.removed} commande(s) effacée(s) — reposées.\n` +
        `✔ ${report.placed} commande(s) posées, dont 1 pour hier (${report.yesterday}) ` +
        `et 2 en attente pour demain (${report.tomorrow}, livraison + retrait).`,
    );
  } finally {
    await harness.close();
  }
}

await main();

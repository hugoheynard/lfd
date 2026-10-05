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
      settle: () => harness.settle(),
    });
    console.log(
      `· ${report.removed} commande(s) effacée(s) — reposées.\n` +
        `· fournil vidé : ${report.production.days} plan(s), ` +
        `${report.production.handovers} attestation(s) de remise, ` +
        `${report.production.facts} fait(s) d'outbox de ces journées.\n` +
        `✔ ${report.placed} commande(s) posées, dont 1 pour hier (${report.yesterday}), ` +
        `${report.counterToday} au comptoir aujourd'hui (${report.today}, Le Labo + Le Village), ` +
        `${report.tomorrowCount} pour demain (${report.tomorrow}, plan à arrêter ce soir) ` +
        `et 2 en attente à J+2 (${report.peakDay}, livraison + retrait) — le PIC du prévisionnel.\n` +
        `· livraison vidée : ${report.rounds.rounds} tournée(s), ${report.rounds.bins} bac(s).\n` +
        `✔ Journée de livraison ${report.delivery.day} : ${report.delivery.deliveriesToday} livraison(s) ` +
        `(${report.delivery.notReady} pas encore prête(s)), ${report.delivery.vehicles} véhicule(s), ` +
        `${report.delivery.rounds} tournée(s), ${report.delivery.stops} arrêt(s), ` +
        `${report.delivery.loadedBins} bac(s) chargé(s) dont ${report.delivery.sharedBins} demi-bac(s) partagé(s), aucune partie ; ` +
        `${report.delivery.unassigned} hors tournée (pas encore prêtes).\n` +
        `· sans livreur : la ligne de commande n'a pas de requérant — « Recharger les commandes » depuis le back-office l'affecte à qui clique.`,
    );
  } finally {
    await harness.close();
  }
}

await main();
